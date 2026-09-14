import { createServerClient } from '@supabase/ssr';
import { RESOLVED_SLOT_HEADER, cookieOptionsForSlot } from '@/lib/supabase/account-slot';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { requireWriteAccess } from '@/lib/server/require-write-access';
import { stripe, MAX_SELF_SERVE_CAPACITY, CAPACITY_BLOCK } from '@/lib/stripe';

async function createClient() {
  const cookieStore = await cookies();
  // Per-tab account slot, resolved by proxy.ts. Absent -> slot 0.
  const slotRaw = (await headers()).get(RESOLVED_SLOT_HEADER);
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Must match every other Supabase client; see lib/supabase/cookie-name.ts
      cookieOptions: cookieOptionsForSlot(slotRaw),
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {}
        },
      },
    }
  );
}

/**
 * Change the licensed asset capacity on an existing subscription.
 *
 * This is the ONLY path that changes capacity. Asset create and Excel import
 * must never call it: capacity is a purchase, and silently re-pricing someone
 * because they added a machine is how a customer discovers a larger invoice
 * they never agreed to. Those paths refuse the write instead and point here.
 *
 * Direction decides timing, and the asymmetry is deliberate:
 *
 *   INCREASE  applies immediately with create_prorations, because the customer
 *             is asking for room they need now and should be billed for it.
 *
 *   DECREASE  is scheduled at period end, never immediate. Applying it now
 *             would credit unused capacity the customer already paid for and,
 *             worse, could drop licensed capacity below the fleet they are
 *             actively running.
 */
export async function POST(request: Request) {
  let step = 'init';
  try {
    step = 'auth';
    const supabase = await createClient();

    // Gate first. A locked or read-only org may not change what it is licensed
    // for; requireWriteAccess also resolves auth and organization.
    const { denied, organizationId } = await requireWriteAccess(supabase);
    if (denied) return denied;

    step = 'parse_body';
    const body = await request.json();
    const requested = Number((body as { capacity?: unknown }).capacity);

    if (!Number.isInteger(requested) || requested <= 0) {
      return NextResponse.json(
        { error: 'capacity must be a positive integer' },
        { status: 400 }
      );
    }

    if (requested % CAPACITY_BLOCK !== 0) {
      return NextResponse.json(
        { error: `capacity must be a multiple of ${CAPACITY_BLOCK}` },
        { status: 400 }
      );
    }

    if (requested > MAX_SELF_SERVE_CAPACITY) {
      return NextResponse.json(
        {
          error: `Veuillez contacter les ventes pour plus de ${MAX_SELF_SERVE_CAPACITY} equipements : contact@travixosystems.com`,
          code: 'contact_sales',
          requested_capacity: requested,
          max_self_serve_capacity: MAX_SELF_SERVE_CAPACITY,
        },
        { status: 400 }
      );
    }

    step = 'load_subscription';
    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, licensed_capacity, status')
      .eq('organization_id', organizationId)
      .single();

    if (subError || !sub?.stripe_subscription_id) {
      return NextResponse.json(
        {
          error: 'Aucun abonnement actif. Souscrivez avant de modifier la capacite.',
          code: 'no_subscription',
        },
        { status: 409 }
      );
    }

    step = 'read_stripe_subscription';
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
    const item = stripeSub.items?.data?.[0];

    if (!item?.id) {
      throw new Error(`subscription ${sub.stripe_subscription_id} has no items`);
    }

    const current = typeof item.quantity === 'number' ? item.quantity : 0;

    if (requested === current) {
      return NextResponse.json({
        capacity: current,
        changed: false,
        effective: 'unchanged',
      });
    }

    if (requested > current) {
      // Increase: now, prorated.
      step = 'increase_capacity';
      await stripe.subscriptionItems.update(item.id, {
        quantity: requested,
        proration_behavior: 'create_prorations',
      });

      // The webhook persists licensed_capacity when Stripe reports the change,
      // but write it here too: the customer is waiting on this response and
      // should not see stale capacity if the event is slow.
      const { error: persistError } = await supabase
        .from('subscriptions')
        .update({ licensed_capacity: requested, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId);
      if (persistError) {
        console.error('[Capacity] persist error:', persistError.message);
      }

      return NextResponse.json({
        capacity: requested,
        previous_capacity: current,
        changed: true,
        effective: 'immediately',
        proration: 'create_prorations',
      });
    }

    // Decrease: at period end, never immediate.
    //
    // A subscription schedule is the only way Stripe defers a quantity change
    // without touching the current period. proration_behavior 'none' on the
    // future phase: the customer keeps what they paid for until it lapses.
    step = 'schedule_decrease';
    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: sub.stripe_subscription_id,
    });

    const phases = schedule.phases || [];
    const currentPhase = phases[0];
    if (!currentPhase) {
      throw new Error(`schedule ${schedule.id} has no current phase`);
    }

    await stripe.subscriptionSchedules.update(schedule.id, {
      phases: [
        {
          items: currentPhase.items.map((i) => ({
            price: typeof i.price === 'string' ? i.price : i.price.id,
            quantity: i.quantity,
          })),
          start_date: currentPhase.start_date,
          end_date: currentPhase.end_date,
        },
        {
          items: currentPhase.items.map((i) => ({
            price: typeof i.price === 'string' ? i.price : i.price.id,
            quantity: requested,
          })),
          proration_behavior: 'none',
        },
      ],
    });

    return NextResponse.json({
      capacity: current,
      pending_capacity: requested,
      changed: true,
      effective: 'period_end',
      effective_at: currentPhase.end_date
        ? new Date(currentPhase.end_date * 1000).toISOString()
        : null,
      schedule_id: schedule.id,
    });
  } catch (error: any) {
    console.error(`[Capacity Error] step=${step}`, error.message, error.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to change capacity' },
      { status: 500 }
    );
  }
}
