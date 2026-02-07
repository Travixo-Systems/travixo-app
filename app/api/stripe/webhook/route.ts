import { NextRequest, NextResponse } from 'next/server';
import { stripe, planFromPriceId } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Service role client — bypasses RLS for webhook writes
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  console.log('[Stripe Webhook] Received request', {
    hasSignature: !!signature,
    bodyLength: body.length,
    hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
  });

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency: check if we already processed this event
  const { data: existing } = await supabaseAdmin
    .from('billing_events')
    .select('id')
    .eq('stripe_event_id', event.id)
    .single();

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  console.log(`[Stripe Webhook] ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event.id);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object as Stripe.Subscription, event.id);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, event.id);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice, event.id);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice, event.id);
        break;

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error(`[Stripe Webhook] Handler error for ${event.type}:`, error.message);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

// --- Helpers ---

async function findOrgByCustomerId(customerId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();
  return data?.id || null;
}

async function findOrgByMetadata(metadata: Stripe.Metadata | null): Promise<string | null> {
  return metadata?.organization_id || null;
}

async function logBillingEvent(params: {
  organizationId: string;
  eventType: string;
  stripeEventId: string;
  stripeSubscriptionId?: string | null;
  stripeInvoiceId?: string | null;
  amount?: number | null;
  status?: string | null;
  metadata?: Record<string, any>;
}) {
  const { error } = await supabaseAdmin.from('billing_events').insert({
    organization_id: params.organizationId,
    event_type: params.eventType,
    stripe_event_id: params.stripeEventId,
    stripe_subscription_id: params.stripeSubscriptionId || null,
    stripe_invoice_id: params.stripeInvoiceId || null,
    amount: params.amount ? params.amount / 100 : null, // cents → euros (DECIMAL)
    status: params.status || null,
    metadata: params.metadata || {},
  });

  if (error) {
    console.error('[Stripe Webhook] Failed to log billing event:', error.message);
  }
}

// --- Event Handlers ---

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, eventId: string) {
  const organizationId = await findOrgByMetadata(session.metadata);
  if (!organizationId) {
    console.error('[Stripe Webhook] No organization_id in checkout metadata');
    return;
  }

  // Save stripe_customer_id on the org if not already set
  const customerId = session.customer as string;
  if (customerId) {
    await supabaseAdmin
      .from('organizations')
      .update({ stripe_customer_id: customerId })
      .eq('id', organizationId)
      .is('stripe_customer_id', null);
  }

  await logBillingEvent({
    organizationId,
    eventType: 'checkout_completed',
    stripeEventId: eventId,
    stripeSubscriptionId: session.subscription as string,
    amount: session.amount_total,
    metadata: { session_id: session.id },
  });

  console.log(`[Stripe Webhook] Checkout completed for org ${organizationId}`);
}

async function handleSubscriptionChange(subscription: Stripe.Subscription, eventId: string) {
  // Find the org — try metadata first, then customer ID
  let organizationId = await findOrgByMetadata(subscription.metadata);
  if (!organizationId) {
    organizationId = await findOrgByCustomerId(subscription.customer as string);
  }
  if (!organizationId) {
    console.error('[Stripe Webhook] Cannot find org for subscription', subscription.id);
    return;
  }

  // Get the price ID from the first line item
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) {
    console.error('[Stripe Webhook] No price ID in subscription');
    return;
  }

  // Map Stripe price → our plan
  const planInfo = planFromPriceId(priceId);

  // Find the plan in our DB
  let planId: string | null = null;
  if (planInfo) {
    const { data: plan } = await supabaseAdmin
      .from('subscription_plans')
      .select('id')
      .eq('slug', planInfo.slug)
      .single();
    planId = plan?.id || null;
  }

  // Map Stripe subscription status → our status
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

  // Upsert into our subscriptions table
  const subscriptionData: Record<string, any> = {
    organization_id: organizationId,
    status,
    billing_cycle: planInfo?.cycle || 'yearly',
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    updated_at: new Date().toISOString(),
  };

  if (planId) {
    subscriptionData.plan_id = planId;
  }

  // Check if subscription record exists for this org
  const { data: existingSub } = await supabaseAdmin
    .from('subscriptions')
    .select('id')
    .eq('organization_id', organizationId)
    .single();

  if (existingSub) {
    const { error: updateErr } = await supabaseAdmin
      .from('subscriptions')
      .update(subscriptionData)
      .eq('organization_id', organizationId);
    if (updateErr) console.error('[Stripe Webhook] Failed to update subscription:', updateErr.message);
  } else {
    const { error: insertErr } = await supabaseAdmin
      .from('subscriptions')
      .insert(subscriptionData);
    if (insertErr) console.error('[Stripe Webhook] Failed to insert subscription:', insertErr.message);
  }

  // Update organization subscription_status
  const { error: orgErr } = await supabaseAdmin
    .from('organizations')
    .update({ subscription_status: status })
    .eq('id', organizationId);
  if (orgErr) console.error('[Stripe Webhook] Failed to update org status:', orgErr.message);

  await logBillingEvent({
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

  console.log(`[Stripe Webhook] Org ${organizationId}: ${planInfo?.slug} (${status})`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription, eventId: string) {
  const organizationId = await findOrgByCustomerId(subscription.customer as string);
  if (!organizationId) {
    console.error('[Stripe Webhook] Cannot find org for deleted subscription');
    return;
  }

  // Mark subscription as cancelled, clear Stripe IDs
  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'cancelled',
      cancel_at_period_end: false,
      cancelled_at: new Date().toISOString(),
      stripe_subscription_id: null,
      stripe_price_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId);

  // Downgrade org to starter plan
  const { data: starterPlan } = await supabaseAdmin
    .from('subscription_plans')
    .select('id')
    .eq('slug', 'starter')
    .single();

  if (starterPlan) {
    await supabaseAdmin
      .from('subscriptions')
      .update({ plan_id: starterPlan.id })
      .eq('organization_id', organizationId);
  }

  await supabaseAdmin
    .from('organizations')
    .update({ subscription_status: 'cancelled' })
    .eq('id', organizationId);

  await logBillingEvent({
    organizationId,
    eventType: 'subscription_deleted',
    stripeEventId: eventId,
    stripeSubscriptionId: subscription.id,
  });

  console.log(`[Stripe Webhook] Subscription cancelled for org ${organizationId}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice, eventId: string) {
  const organizationId = await findOrgByCustomerId(invoice.customer as string);
  if (!organizationId) return;

  await logBillingEvent({
    organizationId,
    eventType: 'payment_succeeded',
    stripeEventId: eventId,
    stripeSubscriptionId: invoice.subscription as string,
    stripeInvoiceId: invoice.id,
    amount: invoice.amount_paid,
    status: 'paid',
  });

  console.log(`[Stripe Webhook] Payment succeeded for org ${organizationId}: EUR ${(invoice.amount_paid / 100).toFixed(2)}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice, eventId: string) {
  const organizationId = await findOrgByCustomerId(invoice.customer as string);
  if (!organizationId) return;

  // Mark org as past_due
  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId);

  await supabaseAdmin
    .from('organizations')
    .update({ subscription_status: 'past_due' })
    .eq('id', organizationId);

  await logBillingEvent({
    organizationId,
    eventType: 'payment_failed',
    stripeEventId: eventId,
    stripeSubscriptionId: invoice.subscription as string,
    stripeInvoiceId: invoice.id,
    amount: invoice.amount_due,
    status: 'failed',
    metadata: {
      attempt_count: invoice.attempt_count,
    },
  });

  console.error(`[Stripe Webhook] PAYMENT FAILED for org ${organizationId}: EUR ${(invoice.amount_due / 100).toFixed(2)}`);
}
