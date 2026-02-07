import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { stripe, PRICE_MAP, getOrCreateStripeCustomer, type PlanSlug, type BillingCycle } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { planSlug, billingCycle = 'yearly' } = body as {
      planSlug: string;
      billingCycle: BillingCycle;
    };

    // Validate plan
    if (!PRICE_MAP[planSlug]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Enterprise requires sales contact
    if (planSlug === 'enterprise') {
      return NextResponse.json(
        { error: 'Veuillez contacter les ventes pour le forfait Enterprise : contact@travixosystems.com' },
        { status: 400 }
      );
    }

    // Get user's organization
    const { data: userData } = await supabase
      .from('users')
      .select('organization_id, email')
      .eq('id', user.id)
      .single();

    if (!userData?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Get organization
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, stripe_customer_id')
      .eq('id', userData.organization_id)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Check if already has active Stripe subscription
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

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(
      org.id,
      org.name,
      userData.email || user.email!,
      org.stripe_customer_id
    );

    // Save customer ID if new
    if (!org.stripe_customer_id) {
      await supabase
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', org.id);
    }

    // Get the price ID
    const priceId = PRICE_MAP[planSlug][billingCycle];
    if (!priceId) {
      return NextResponse.json({ error: 'Price not configured' }, { status: 400 });
    }

    // Create Stripe Checkout session
    const origin = request.headers.get('origin') || 'https://app.travixosystems.com';
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
    console.error('[Stripe Checkout Error]', error.message, error.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
