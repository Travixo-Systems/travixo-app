// app/api/subscriptions/route.ts
import { createServerClient } from '@supabase/ssr';
import { RESOLVED_SLOT_HEADER, cookieOptionsForSlot } from '@/lib/supabase/account-slot';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { isAccountLocked } from '@/lib/billing/pilot-window';
import { PILOT_MAX_ASSETS } from '@/lib/billing/access-model';
import { ACTIVE_STATUSES } from '@/lib/subscription';

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

// GET - Fetch organization's current subscription
export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const organizationId = userData.organization_id;

    // Fetch subscription with plan details
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .eq('organization_id', organizationId)
      .single();

    if (subError) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    // Fetch organization details (pilot status)
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, is_pilot, pilot_start_date, pilot_end_date, converted_to_paid')
      .eq('id', organizationId)
      .single();

    if (orgError) {
      console.error('Organization lookup error:', orgError);
    }

    // Check current asset count (exclude archived/retired assets)
    const { count: assetCount, error: countError } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('archived_at', null);

    if (countError) {
      console.error('Error counting assets:', countError);
    }

    const currentAssets = assetCount || 0;

    // Billable count: what a licence is actually sold against. Demo data is
    // excluded, and is_demo_data is nullable, so .eq(false) would silently drop
    // every legacy row and under-report. This is the number the subscription
    // page sizes capacity from, so it must match what checkout counts.
    const { count: billableCount, error: billableError } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .or('is_demo_data.eq.false,is_demo_data.is.null');

    if (billableError) {
      console.error('Error counting billable assets:', billableError);
    }

    const billableAssets = billableCount ?? currentAssets;

    // Check if pilot is active
    const isPilot = org?.is_pilot || false;
    const isPilotActive = isPilot &&
      org?.pilot_start_date &&
      org?.pilot_end_date &&
      new Date() >= new Date(org.pilot_start_date) &&
      new Date() <= new Date(org.pilot_end_date);

    // For pilots: calculate days remaining from pilot_end_date
    // For regular subscriptions: from subscription period end
    let daysRemaining = null;
    if (isPilotActive && org.pilot_end_date) {
      const endDate = new Date(org.pilot_end_date);
      const today = new Date();
      daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    } else if (subscription?.current_period_end) {
      const endDate = new Date(subscription.current_period_end);
      const today = new Date();
      daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Asset limit.
    //
    // subscription_plans.max_assets is NOT read any more. On the travixo row it
    // is the int4 sentinel (2147483647), and rendering that as a ceiling is
    // meaningless -- capacity lives on the subscription now. Mirrors
    // org_max_assets(): pilot allowance while a pilot runs, else the licensed
    // capacity, else the same finite floor the database falls back to.
    const licensedCapacity: number | null =
      typeof subscription?.licensed_capacity === 'number'
        ? subscription.licensed_capacity
        : null;

    const maxAssets = isPilotActive
      ? PILOT_MAX_ASSETS
      : (licensedCapacity ?? 100);

    // Hard cutoff after the full window plus the read-only grace period
    // (30 + 15). The figures live in lib/billing/pilot-window.
    const convertedToPaid = org?.converted_to_paid || false;
    const accountLocked = isAccountLocked({
      isPilot,
      pilotActive: isPilotActive,
      convertedToPaid,
      pilotStartDate: org?.pilot_start_date,
    });

    // Determine VGP access level
    let vgp_access: 'full' | 'read_only' | 'blocked' = 'blocked';
    if (accountLocked) {
      vgp_access = 'blocked';
    } else if (isPilotActive) {
      vgp_access = 'full';
    } else if (
      // An active subscription, not a plan name. With one plan an allowlist can
      // only ever grant, and it rots silently the moment a slug changes -- it
      // had already outlived three of the four slugs it listed.
      ACTIVE_STATUSES.has(subscription?.status || '')
    ) {
      vgp_access = 'full';
    } else if (isPilot && !isPilotActive) {
      // Expired pilot inside the read-only grace window, read-only VGP
      vgp_access = 'read_only';
    }

    return NextResponse.json({
      subscription: subscription || null,
      organization: org,
      usage: {
        assets: currentAssets,
        billable: billableAssets,
        max_assets: maxAssets,
        licensed_capacity: licensedCapacity,
        // Measured against the billable count, because that is what the
        // licence covers and what the insert trigger counts.
        limit_reached: billableAssets >= maxAssets,
        over_capacity: licensedCapacity !== null && billableAssets > licensedCapacity,
      },
      days_remaining: daysRemaining,
      // Only an unpaid org is on a trial. A Stripe subscription exists solely
      // because someone paid, so a row carrying one must never surface as a
      // trial regardless of the Stripe status on it. No trial is offered at
      // checkout, so in practice this guards rows written by earlier paths.
      is_trial:
        subscription?.status === 'trialing' &&
        !subscription?.stripe_subscription_id &&
        !org?.converted_to_paid,
      is_pilot: isPilot,
      pilot_active: isPilotActive,
      pilot_end_date: org?.pilot_end_date || null,
      vgp_access,
      account_locked: accountLocked,
    });

  } catch (error: any) {
    console.error('Subscription fetch error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// POST - Update subscription (upgrade/downgrade)
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { plan_slug, billing_cycle = 'monthly' } = body;

    if (!plan_slug) {
      return NextResponse.json({ error: 'Plan slug is required' }, { status: 400 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const organizationId = userData.organization_id;

    // There are no plans to switch between any more.
    //
    // This handler belongs to the retired tier model: it swapped plan_id,
    // refused downgrades by comparing the asset count against the target
    // plan's max_assets, and wrote a period end from a 'yearly' cycle. Under
    // capacity pricing all three are wrong -- max_assets on the only active
    // plan row is the int4 sentinel, so the downgrade guard could never fire,
    // and it would write a subscription row Stripe knows nothing about.
    //
    // Refused outright rather than left reachable. Capacity changes go through
    // POST /api/stripe/subscription/capacity, which talks to Stripe; a new
    // subscription goes through POST /api/stripe/checkout.
    return NextResponse.json(
      {
        error: 'plan_changes_retired',
        message:
          'Les forfaits ont ete remplaces par la capacite sous licence. Utilisez /api/stripe/subscription/capacity pour modifier votre capacite.',
      },
      { status: 410 }
    );

  } catch (error: any) {
    console.error('Subscription update error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}