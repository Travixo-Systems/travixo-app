import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';

// Lazy-init to catch env var issues at request time, not module load
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key, {
    apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
    typescript: true,
  });
}

function getSupabaseAdmin() {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(`Missing supabase env: url=${!!url} key=${!!key}`);
  return createClient(url, key);
}

// Reverse lookup from price ID to plan slug + cycle
function planFromPriceId(priceId: string): { slug: string; cycle: 'monthly' | 'yearly' } | null {
  const map: Record<string, Record<string, string | undefined>> = {
    starter: {
      monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
      yearly: process.env.STRIPE_PRICE_STARTER_ANNUAL,
    },
    professional: {
      monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
      yearly: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
    },
    business: {
      monthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY,
      yearly: process.env.STRIPE_PRICE_BUSINESS_ANNUAL,
    },
  };

  for (const [slug, prices] of Object.entries(map)) {
    if (prices.monthly === priceId) return { slug, cycle: 'monthly' };
    if (prices.yearly === priceId) return { slug, cycle: 'yearly' };
  }
  return null;
}

function safeISODate(timestamp: number | undefined | null): string | null {
  if (!timestamp || typeof timestamp !== 'number') return null;
  try {
    return new Date(timestamp * 1000).toISOString();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let step = 'init';
  try {
    step = 'read_body';
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    console.log('[Webhook] Received', { bodyLen: body.length, hasSig: !!signature });

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    step = 'verify_signature';
    const stripeClient = getStripe();
    let event: Stripe.Event;

    try {
      event = stripeClient.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      console.error('[Webhook] Signature failed:', err.message);
      return NextResponse.json({ error: `Signature verification failed: ${err.message}` }, { status: 400 });
    }

    step = 'get_supabase';
    const supabase = getSupabaseAdmin();

    step = 'idempotency_check';
    const { data: existing } = await supabase
      .from('billing_events')
      .select('id')
      .eq('stripe_event_id', event.id)
      .single();

    if (existing) {
      console.log(`[Webhook] Duplicate event ${event.id}, skipping`);
      return NextResponse.json({ received: true, duplicate: true });
    }

    console.log(`[Webhook] Processing ${event.type} (${event.id})`);

    step = `handle_${event.type}`;
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(supabase, event.data.object, event.id);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(supabase, event.data.object, event.id);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabase, event.data.object, event.id);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(supabase, event.data.object, event.id);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(supabase, event.data.object, event.id);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error(`[Webhook] FATAL step=${step}:`, error.message, error.stack);
    return NextResponse.json(
      { error: `Webhook failed at ${step}: ${error.message}` },
      { status: 500 }
    );
  }
}

// GET endpoint for testing if the route loads
export async function GET() {
  try {
    const checks = {
      stripe_key: !!process.env.STRIPE_SECRET_KEY,
      webhook_secret: !!process.env.STRIPE_WEBHOOK_SECRET,
      supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      service_role_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      price_starter_monthly: !!process.env.STRIPE_PRICE_STARTER_MONTHLY,
      price_starter_annual: !!process.env.STRIPE_PRICE_STARTER_ANNUAL,
      price_professional_monthly: !!process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
      price_professional_annual: !!process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
      price_business_monthly: !!process.env.STRIPE_PRICE_BUSINESS_MONTHLY,
      price_business_annual: !!process.env.STRIPE_PRICE_BUSINESS_ANNUAL,
    };
    return NextResponse.json({ status: 'ok', env: checks });
  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
  }
}

// --- Helpers ---

async function findOrgByCustomerId(supabase: any, customerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();
  if (error) console.error('[Webhook] findOrgByCustomerId error:', error.message);
  return data?.id || null;
}

async function logBillingEvent(supabase: any, params: {
  organizationId: string;
  eventType: string;
  stripeEventId: string;
  stripeSubscriptionId?: string | null;
  stripeInvoiceId?: string | null;
  amount?: number | null;
  status?: string | null;
  metadata?: Record<string, any>;
}) {
  const { error } = await supabase.from('billing_events').insert({
    organization_id: params.organizationId,
    event_type: params.eventType,
    stripe_event_id: params.stripeEventId,
    stripe_subscription_id: params.stripeSubscriptionId || null,
    stripe_invoice_id: params.stripeInvoiceId || null,
    amount: params.amount ? params.amount / 100 : null,
    status: params.status || null,
    metadata: params.metadata || {},
  });

  if (error) {
    console.error('[Webhook] logBillingEvent error:', error.message);
  }
}

// --- Event Handlers ---

async function handleCheckoutCompleted(supabase: any, session: any, eventId: string) {
  const organizationId = session?.metadata?.organization_id;
  if (!organizationId) {
    console.error('[Webhook] checkout: no organization_id in metadata', JSON.stringify(session?.metadata));
    return;
  }

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (customerId) {
    const { error } = await supabase
      .from('organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', organizationId)
      .is('stripe_customer_id', null);
    if (error) console.error('[Webhook] checkout: save customer_id error:', error.message);
  }

  await logBillingEvent(supabase, {
    organizationId,
    eventType: 'checkout_completed',
    stripeEventId: eventId,
    stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
    amount: session.amount_total,
    metadata: { session_id: session.id },
  });

  console.log(`[Webhook] Checkout completed for org ${organizationId}`);
}

async function handleSubscriptionChange(supabase: any, subscription: any, eventId: string) {
  console.log('[Webhook] subscription data:', JSON.stringify({
    id: subscription.id,
    status: subscription.status,
    customer: subscription.customer,
    metadata: subscription.metadata,
    items_count: subscription.items?.data?.length,
    current_period_start: subscription.current_period_start,
    current_period_end: subscription.current_period_end,
  }));

  // Find the org
  let organizationId = subscription?.metadata?.organization_id || null;
  if (!organizationId) {
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    if (customerId) {
      organizationId = await findOrgByCustomerId(supabase, customerId);
    }
  }
  if (!organizationId) {
    console.error('[Webhook] subscription: cannot find org');
    return;
  }

  // Get the price ID
  const priceId = subscription.items?.data?.[0]?.price?.id
    || subscription.items?.data?.[0]?.plan?.id;
  if (!priceId) {
    console.error('[Webhook] subscription: no price ID found in items', JSON.stringify(subscription.items));
    return;
  }

  // Map Stripe price to our plan
  const planInfo = planFromPriceId(priceId);
  console.log(`[Webhook] priceId=${priceId} → plan=${planInfo?.slug || 'unknown'} cycle=${planInfo?.cycle || 'unknown'}`);

  // Find the plan in our DB
  let planId: string | null = null;
  if (planInfo) {
    const { data: plan, error: planErr } = await supabase
      .from('subscription_plans')
      .select('id')
      .eq('slug', planInfo.slug)
      .single();
    if (planErr) console.error('[Webhook] subscription: plan lookup error:', planErr.message);
    planId = plan?.id || null;
  }

  // Map status
  const statusMap: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'cancelled',
    unpaid: 'past_due',
    trialing: 'trialing',
    incomplete: 'trialing',
    incomplete_expired: 'expired',
    paused: 'cancelled',
  };
  const status = statusMap[subscription.status] || 'active';

  // Build subscription data — safe date conversions
  const subscriptionData: Record<string, any> = {
    organization_id: organizationId,
    status,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    updated_at: new Date().toISOString(),
  };

  // Only set optional fields if they have valid values
  if (planInfo?.cycle) subscriptionData.billing_cycle = planInfo.cycle;
  const periodStart = safeISODate(subscription.current_period_start);
  const periodEnd = safeISODate(subscription.current_period_end);
  if (periodStart) subscriptionData.current_period_start = periodStart;
  if (periodEnd) subscriptionData.current_period_end = periodEnd;
  if (planId) subscriptionData.plan_id = planId;

  console.log('[Webhook] subscriptionData:', JSON.stringify(subscriptionData));

  // Upsert
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('organization_id', organizationId)
    .single();

  if (existingSub) {
    const { error: updateErr } = await supabase
      .from('subscriptions')
      .update(subscriptionData)
      .eq('organization_id', organizationId);
    if (updateErr) console.error('[Webhook] subscription update error:', updateErr.message);
    else console.log('[Webhook] subscription updated successfully');
  } else {
    const { error: insertErr } = await supabase
      .from('subscriptions')
      .insert(subscriptionData);
    if (insertErr) console.error('[Webhook] subscription insert error:', insertErr.message);
    else console.log('[Webhook] subscription inserted successfully');
  }

  // Update organization status
  const { error: orgErr } = await supabase
    .from('organizations')
    .update({ subscription_status: status })
    .eq('id', organizationId);
  if (orgErr) console.error('[Webhook] org status update error:', orgErr.message);

  await logBillingEvent(supabase, {
    organizationId,
    eventType: 'subscription_updated',
    stripeEventId: eventId,
    stripeSubscriptionId: subscription.id,
    status,
    metadata: {
      plan: planInfo?.slug,
      cycle: planInfo?.cycle,
      stripe_status: subscription.status,
    },
  });

  console.log(`[Webhook] Done: org=${organizationId} plan=${planInfo?.slug} status=${status}`);
}

async function handleSubscriptionDeleted(supabase: any, subscription: any, eventId: string) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
  const organizationId = customerId ? await findOrgByCustomerId(supabase, customerId) : null;
  if (!organizationId) {
    console.error('[Webhook] deleted: cannot find org');
    return;
  }

  await supabase
    .from('subscriptions')
    .update({
      status: 'cancelled',
      stripe_subscription_id: null,
      stripe_price_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId);

  // Downgrade to starter
  const { data: starterPlan } = await supabase
    .from('subscription_plans')
    .select('id')
    .eq('slug', 'starter')
    .single();

  if (starterPlan) {
    await supabase
      .from('subscriptions')
      .update({ plan_id: starterPlan.id })
      .eq('organization_id', organizationId);
  }

  await supabase
    .from('organizations')
    .update({ subscription_status: 'cancelled' })
    .eq('id', organizationId);

  await logBillingEvent(supabase, {
    organizationId,
    eventType: 'subscription_deleted',
    stripeEventId: eventId,
    stripeSubscriptionId: subscription.id,
  });

  console.log(`[Webhook] Subscription cancelled for org ${organizationId}`);
}

async function handlePaymentSucceeded(supabase: any, invoice: any, eventId: string) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  const organizationId = customerId ? await findOrgByCustomerId(supabase, customerId) : null;
  if (!organizationId) return;

  await logBillingEvent(supabase, {
    organizationId,
    eventType: 'payment_succeeded',
    stripeEventId: eventId,
    stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
    stripeInvoiceId: invoice.id,
    amount: invoice.amount_paid,
    status: 'paid',
  });

  console.log(`[Webhook] Payment OK org=${organizationId} EUR ${((invoice.amount_paid || 0) / 100).toFixed(2)}`);
}

async function handlePaymentFailed(supabase: any, invoice: any, eventId: string) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  const organizationId = customerId ? await findOrgByCustomerId(supabase, customerId) : null;
  if (!organizationId) return;

  await supabase
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId);

  await supabase
    .from('organizations')
    .update({ subscription_status: 'past_due' })
    .eq('id', organizationId);

  await logBillingEvent(supabase, {
    organizationId,
    eventType: 'payment_failed',
    stripeEventId: eventId,
    stripeSubscriptionId: typeof invoice.subscription === 'string' ? invoice.subscription : null,
    stripeInvoiceId: invoice.id,
    amount: invoice.amount_due,
    status: 'failed',
    metadata: { attempt_count: invoice.attempt_count },
  });

  console.error(`[Webhook] PAYMENT FAILED org=${organizationId}`);
}
