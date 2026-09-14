import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  stripe,
  PRICE_MAP,
  getOrCreateStripeCustomer,
  licensedCapacityFor,
  MAX_SELF_SERVE_CAPACITY,
  type BillingCycle,
} from '@/lib/stripe';

export async function POST(request: NextRequest) {
  let step = 'init';
  try {
    // Step 1: Auth
    step = 'auth';
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', detail: authError?.message || 'No user session' },
        { status: 401 }
      );
    }

    // Step 2: Parse body
    //
    // There is no plan to choose any more -- only how often you are billed.
    step = 'parse_body';
    const body = await request.json();
    const { billingCycle = 'annual' } = body as { billingCycle: BillingCycle };

    if (billingCycle !== 'monthly' && billingCycle !== 'annual') {
      return NextResponse.json(
        { error: `Invalid billing cycle: "${billingCycle}". Expected 'monthly' or 'annual'.` },
        { status: 400 }
      );
    }

    // Step 3: Get user's organization
    step = 'get_user';
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id, email')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      return NextResponse.json(
        { error: `User profile not found (${userError?.message || 'no organization_id'})` },
        { status: 404 }
      );
    }

    // Step 4: Get organization
    step = 'get_org';
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, stripe_customer_id')
      .eq('id', userData.organization_id)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: `Organization not found (${orgError?.message || 'null result'})` },
        { status: 404 }
      );
    }

    // Step 5: Check existing subscription
    step = 'check_existing_sub';
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id, status')
      .eq('organization_id', org.id)
      .single();

    if (existingSub?.stripe_subscription_id && existingSub.status === 'active') {
      return NextResponse.json(
        { error: 'Vous avez deja un abonnement actif. Utilisez le portail de facturation pour changer de forfait.' },
        { status: 400 }
      );
    }

    // Step 6: Work out the capacity being licensed.
    //
    // Billable excludes demo data. is_demo_data is nullable with a default of
    // false, so rows written before the column existed hold NULL -- an
    // .eq('is_demo_data', false) would silently drop them and under-license the
    // customer. Archived assets are excluded to match how every other count in
    // the app treats them.
    step = 'count_assets';
    const { count: billableCount, error: countError } = await supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .is('archived_at', null)
      .or('is_demo_data.eq.false,is_demo_data.is.null');

    if (countError) {
      return NextResponse.json(
        { error: `Unable to count assets (${countError.message})` },
        { status: 500 }
      );
    }

    const licensedCapacity = licensedCapacityFor(billableCount || 0);

    // Above the self-serve ceiling this stops being a checkout and becomes a
    // conversation. No Stripe session is created.
    if (licensedCapacity > MAX_SELF_SERVE_CAPACITY) {
      return NextResponse.json(
        {
          error: `Veuillez contacter les ventes pour plus de ${MAX_SELF_SERVE_CAPACITY} equipements : contact@travixosystems.com`,
          code: 'contact_sales',
          billable_assets: billableCount || 0,
          licensed_capacity: licensedCapacity,
          max_self_serve_capacity: MAX_SELF_SERVE_CAPACITY,
        },
        { status: 400 }
      );
    }

    // Step 7: Get or create Stripe customer
    step = 'create_customer';
    const customerId = await getOrCreateStripeCustomer(
      org.id,
      org.name,
      userData.email || user.email!,
      org.stripe_customer_id
    );

    // Save customer ID if new
    if (!org.stripe_customer_id) {
      step = 'save_customer_id';
      await supabase
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', org.id);
    }

    // Step 8: Resolve price ID
    step = 'resolve_price';
    const priceId = PRICE_MAP[billingCycle];
    if (!priceId) {
      return NextResponse.json(
        { error: `Price not configured for ${billingCycle}. Check STRIPE_PRICE_TRAVIXO_* env vars.` },
        { status: 400 }
      );
    }

    // Step 9: Create Stripe Checkout session.
    //
    // quantity is the licensed capacity. adjustable_quantity is deliberately
    // absent: capacity is derived from the fleet and changed through
    // /api/stripe/subscription/capacity, never edited by the customer at the
    // till, where a lower number would buy less than they already use.
    //
    // No trial. The annual discount lives in the price itself -- the annual
    // price is ten months of the monthly rate for twelve months of service --
    // so bonus months on top would apply it twice.
    step = 'create_session';
    const origin = request.headers.get('origin') || 'https://app.travixosystems.com';
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: licensedCapacity }],
      success_url: `${origin}/settings/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings/subscription?checkout=canceled`,
      subscription_data: {
        metadata: {
          organization_id: org.id,
          // The capacity sold, visible on the Stripe subscription itself rather
          // than only inferable from the item quantity.
          licensed_capacity: String(licensedCapacity),
        },
      },
      metadata: { organization_id: org.id },
      locale: 'fr',
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url, licensed_capacity: licensedCapacity });
  } catch (error: any) {
    console.error(`[Stripe Checkout Error] step=${step}`, error.message, error.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
