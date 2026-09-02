import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import * as Sentry from '@sentry/node';
import { markOrganizationConverted, isPayingStatus, billingStatusFromStripe } from '@/lib/billing/mark-converted';

export const runtime = 'nodejs';

/**
 * How long a claim may sit at status 'processing' before it is treated as a
 * crashed attempt rather than an in-flight one. Comfortably longer than any
 * handler here should take, and shorter than Stripe's retry window, so a
 * stuck event is surfaced while retries are still arriving.
 */
const STALE_CLAIM_MS = 10 * 60 * 1000;

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

    // Claim the event BEFORE applying it.
    //
    // This used to be a SELECT here and the matching INSERT at the very end,
    // after every mutation had already run. Anything that killed the
    // invocation in between -- a timeout, a crash, a deploy -- left no marker,
    // so Stripe's retry re-ran the whole handler and re-applied the writes.
    //
    // The claim is an INSERT on stripe_event_id, which carries a UNIQUE
    // constraint (20260207_stripe_billing.sql). A duplicate therefore loses
    // the race in Postgres rather than in application logic, which also closes
    // the window where two concurrent deliveries of the same event both read
    // "not seen yet" and both proceeded.
    step = 'claim_event';
    const claim = await claimBillingEvent(supabase, event);

    if (claim === 'duplicate') {
      console.log(`[Webhook] Duplicate event ${event.id}, skipping`);
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (claim === 'stale') {
      // An earlier attempt claimed this event and never finished. Refusing it
      // keeps Stripe retrying, which is the only path back to the event being
      // applied at all -- acking here would lose it silently. Already reported
      // to Sentry by claimBillingEvent().
      console.error(`[Webhook] Stale claim for ${event.type} (${event.id}), refusing so Stripe retries`);
      return NextResponse.json(
        { error: 'previous attempt did not complete', stripeEventId: event.id },
        { status: 500 }
      );
    }

    if (claim === 'unresolved_org') {
      // No organization to attribute this to. Ack rather than 500: retrying
      // will not make the org appear, and a permanent 500 makes Stripe retry
      // for days and eventually disable the endpoint.
      console.warn(`[Webhook] No organization for ${event.type} (${event.id}), acking`);
      return NextResponse.json({ received: true, unattributed: true });
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

    // Settle the claim.
    //
    // Handlers normally do this via logBillingEvent(), but several return early
    // (no organization on the object, no price id) and the default case never
    // calls it at all. Any of those would leave the row at 'processing'
    // forever, and a later redelivery would then be misread as a crashed
    // attempt and refused. Clearing it here means 'processing' survives only
    // where it should: an invocation that genuinely died mid-handler.
    step = 'settle_claim';
    const { error: settleError } = await supabase
      .from('billing_events')
      .update({ status: 'processed' })
      .eq('stripe_event_id', event.id)
      .eq('status', 'processing');

    if (settleError) {
      console.error('[Webhook] settle claim error:', settleError.message);
      Sentry.captureException(settleError, {
        tags: { area: 'stripe_webhook', step: 'settle_claim' },
        extra: { stripeEventId: event.id, eventType: event.type },
      });
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

// Deploy diagnostic. Reports the SHAPE of the Stripe configuration -- key mode
// and whether price ids are well formed -- never a value.
//
// Even so it is not public: knowing whether an endpoint is in test mode, or
// which price variables are unset, is reconnaissance. It now requires the same
// bearer secret the cron routes use, and answers 404 rather than 401 without
// it, so an unauthenticated caller cannot even confirm the endpoint exists.
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization');
  if (!expected || provided !== `Bearer ${expected}`) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    // Presence alone cannot catch the failure that actually bites: a test key
    // deployed to production. `!!` reads true for sk_test_ and sk_live_ alike,
    // so report the MODE. A price id is opaque, so report only whether it is
    // set and well formed (price_...), never the value itself.
    const secret = process.env.STRIPE_SECRET_KEY || '';
    const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

    const keyMode = secret.startsWith('sk_live_')
      ? 'live'
      : secret.startsWith('sk_test_')
        ? 'test'
        : secret
          ? 'unrecognised'
          : 'missing';

    const publishableMode = publishable.startsWith('pk_live_')
      ? 'live'
      : publishable.startsWith('pk_test_')
        ? 'test'
        : publishable
          ? 'unrecognised'
          : 'missing';

    const priceVars = {
      price_starter_monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
      price_starter_annual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
      price_professional_monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY,
      price_professional_annual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL,
      price_business_monthly: process.env.STRIPE_PRICE_BUSINESS_MONTHLY,
      price_business_annual: process.env.STRIPE_PRICE_BUSINESS_ANNUAL,
    };

    // A Payment Link URL pasted in place of a price id fails at checkout with
    // "No such price", so flag the shape here rather than at the till.
    const prices = Object.fromEntries(
      Object.entries(priceVars).map(([k, v]) => [
        k,
        !v ? 'missing' : v.startsWith('price_') ? 'ok' : 'malformed',
      ])
    );

    const malformed = Object.values(prices).filter((v) => v !== 'ok').length;
    const consistent = keyMode === publishableMode;

    return NextResponse.json({
      status: 'ok',
      stripe_mode: keyMode,
      publishable_mode: publishableMode,
      keys_consistent: consistent,
      webhook_secret: !!process.env.STRIPE_WEBHOOK_SECRET,
      supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      service_role_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      prices,
      ready_to_charge: keyMode === 'live' && consistent && malformed === 0,
    });
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

/**
 * Resolve the organization an event belongs to, the same way the individual
 * handlers do: metadata first, then the customer id.
 */
async function resolveEventOrganization(supabase: any, event: any): Promise<string | null> {
  const object = event?.data?.object ?? {};

  const fromMetadata = object?.metadata?.organization_id;
  if (fromMetadata) return fromMetadata;

  const rawCustomer = object?.customer;
  const customerId = typeof rawCustomer === 'string' ? rawCustomer : rawCustomer?.id;
  if (customerId) return await findOrgByCustomerId(supabase, customerId);

  return null;
}

/**
 * Take exclusive ownership of a Stripe event before its writes are applied.
 *
 * Returns:
 *   'claimed'        - this invocation owns the event and must process it
 *   'duplicate'      - already processed (or being processed); do nothing
 *   'unresolved_org' - cannot attribute the event to an organization
 *   'stale'          - a previous attempt claimed it and never finished
 *
 * The UNIQUE constraint on billing_events.stripe_event_id is what makes this
 * safe under concurrent delivery: the second INSERT fails with 23505 rather
 * than both callers deciding they are first.
 */
async function claimBillingEvent(
  supabase: any,
  event: any
): Promise<'claimed' | 'duplicate' | 'unresolved_org' | 'stale'> {
  const organizationId = await resolveEventOrganization(supabase, event);
  if (!organizationId) return 'unresolved_org';

  const { error } = await supabase.from('billing_events').insert({
    organization_id: organizationId,
    event_type: event.type,
    stripe_event_id: event.id,
    status: 'processing',
    metadata: { claimed_at: new Date().toISOString() },
  });

  if (!error) return 'claimed';

  // 23505 = unique_violation: someone already claimed this event id.
  //
  // Usually that is a genuine duplicate delivery and there is nothing to do.
  // But it is also what a CRASHED earlier attempt looks like: the claim row was
  // written, the handler died before finishing, and the row is still sitting at
  // status 'processing'. Treating that as a duplicate would swallow every
  // subsequent Stripe retry, and the event would be lost rather than applied.
  //
  // Lost is better than double-applied for money, but only if someone can see
  // it. So a claim that is still 'processing' well past any plausible handler
  // runtime is reported and refused, which keeps Stripe retrying instead of
  // giving up.
  if (error.code === '23505') {
    const { data: existing } = await supabase
      .from('billing_events')
      .select('status, created_at')
      .eq('stripe_event_id', event.id)
      .single();

    const ageMs = existing?.created_at
      ? Date.now() - new Date(existing.created_at).getTime()
      : 0;

    if (existing?.status === 'processing' && ageMs > STALE_CLAIM_MS) {
      Sentry.captureException(
        new Error(`Stripe event stuck in processing: ${event.id} (${event.type})`),
        {
          tags: { area: 'stripe_webhook', step: 'stale_claim' },
          extra: {
            stripeEventId: event.id,
            eventType: event.type,
            ageMinutes: Math.round(ageMs / 60_000),
          },
        }
      );
      return 'stale';
    }

    return 'duplicate';
  }

  // Any other failure means we cannot guarantee exactly-once. Refusing the
  // event lets Stripe retry, which is safer than applying writes we might
  // apply again later.
  throw new Error(`claimBillingEvent failed: ${error.message}`);
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
  // The row already exists: claimBillingEvent() inserted it before the handler
  // ran. Filling in the details is an UPDATE now, not an INSERT -- an INSERT
  // would collide with the UNIQUE constraint on stripe_event_id and log a
  // spurious error on every successful event.
  const { error } = await supabase
    .from('billing_events')
    .update({
      event_type: params.eventType,
      stripe_subscription_id: params.stripeSubscriptionId || null,
      stripe_invoice_id: params.stripeInvoiceId || null,
      amount: params.amount ? params.amount / 100 : null,
      status: params.status || 'processed',
      metadata: params.metadata || {},
    })
    .eq('stripe_event_id', params.stripeEventId);

  if (error) {
    console.error('[Webhook] logBillingEvent error:', error.message);
    Sentry.captureException(error, {
      tags: { area: 'stripe_webhook', step: 'log_billing_event' },
      extra: { stripeEventId: params.stripeEventId, eventType: params.eventType },
    });
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

  // Convert the org out of pilot state. Without this the customer keeps
  // is_pilot=true and converted_to_paid=false, so the read-only gate freezes
  // them once their original pilot window closes -- despite having paid.
  const { error: convErr } = await markOrganizationConverted(supabase, organizationId, {
    status: 'active',
  });
  if (convErr) { console.error('[Webhook] checkout: mark converted error:', convErr); Sentry.captureException(convErr, { tags: { area: 'stripe_webhook', step: 'checkout_mark_converted' } }); }
  else console.log(`[Webhook] org ${organizationId} converted to paid`);

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
  // A Stripe subscription only exists here because someone paid: pilots are
  // tracked on the organization, never as a subscription. So a Stripe
  // `trialing` is our 90-day service-term deferral, not a free trial, and
  // must not be stored or displayed as one.
  const hasPaid = isPayingStatus(subscription.status);
  const status = billingStatusFromStripe(subscription.status, hasPaid);

  // Build subscription data, safe date conversions
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
    if (updateErr) { console.error('[Webhook] subscription update error:', updateErr.message); Sentry.captureException(updateErr, { tags: { area: 'stripe_webhook', step: 'subscription_update' } }); }
    else console.log('[Webhook] subscription updated successfully');
  } else {
    const { error: insertErr } = await supabase
      .from('subscriptions')
      .insert(subscriptionData);
    if (insertErr) { console.error('[Webhook] subscription insert error:', insertErr.message); Sentry.captureException(insertErr, { tags: { area: 'stripe_webhook', step: 'subscription_insert' } }); }
    else console.log('[Webhook] subscription inserted successfully');
  }

  // Update organization status, and convert out of pilot when the Stripe
  // status means they are genuinely paying. Checkout is not the only path to a
  // paid subscription: a plan change or a recovered payment arrives here, and
  // a customer converting that way would otherwise stay a pilot forever.
  //
  // Note 'trialing' counts as paying. Professional annual carries a 90-day
  // Stripe trial to deliver the 15-month service term, so the customers who
  // paid the most arrive here as trialing.
  if (isPayingStatus(subscription.status)) {
    const { error: convErr } = await markOrganizationConverted(supabase, organizationId, {
      planSlug: planInfo?.slug || null,
      status,
    });
    if (convErr) { console.error('[Webhook] subscription: mark converted error:', convErr); Sentry.captureException(convErr, { tags: { area: 'stripe_webhook', step: 'subscription_mark_converted' } }); }
    else console.log(`[Webhook] org ${organizationId} converted (${subscription.status})`);
  } else {
    const { error: orgErr } = await supabase
      .from('organizations')
      .update({ subscription_status: status })
      .eq('id', organizationId);
    if (orgErr) { console.error('[Webhook] org status update error:', orgErr.message); Sentry.captureException(orgErr, { tags: { area: 'stripe_webhook', step: 'org_status_update' } }); }
  }

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
