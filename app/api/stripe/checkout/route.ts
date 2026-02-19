import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe, PRICE_MAP, getOrCreateStripeCustomer, type PlanSlug, type BillingCycle } from '@/lib/stripe';

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
    step = 'parse_body';
    const body = await request.json();
    const { planSlug, billingCycle = 'yearly' } = body as {
      planSlug: string;
      billingCycle: BillingCycle;
    };

    // Validate plan
    if (!PRICE_MAP[planSlug]) {
      return NextResponse.json(
        { error: `Invalid plan: "${planSlug}". Valid plans: ${Object.keys(PRICE_MAP).join(', ')}` },
        { status: 400 }
      );
    }

    // Enterprise requires sales contact
    if (planSlug === 'enterprise') {
      return NextResponse.json(
        { error: 'Veuillez contacter les ventes pour le forfait Enterprise : contact@loxam.fr' },
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

    // Step 6: Get or create Stripe customer
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

    // Step 7: Resolve price ID
    step = 'resolve_price';
    const priceId = PRICE_MAP[planSlug]?.[billingCycle];
    if (!priceId) {
      return NextResponse.json(
        { error: `Price not configured for ${planSlug}/${billingCycle}. Check STRIPE_PRICE_* env vars.` },
        { status: 400 }
      );
    }

    // Step 8: Create Stripe Checkout session
    step = 'create_session';
    const origin = request.headers.get('origin') || 'https://app.loxam.fr';
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings/subscription?checkout=canceled`,
      subscription_data: {
        metadata: { organization_id: org.id },
      },
      metadata: { organization_id: org.id },
      locale: 'fr',
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error(`[Stripe Checkout Error] step=${step}`, error.message, error.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
