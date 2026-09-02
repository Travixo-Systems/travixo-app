// app/api/subscriptions/route.ts
import { createServerClient } from '@supabase/ssr';
import { RESOLVED_SLOT_HEADER, cookieOptionsForSlot } from '@/lib/supabase/account-slot';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { isAccountLocked } from '@/lib/billing/pilot-window';
import { PILOT_MAX_ASSETS } from '@/lib/billing/access-model';

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

    // Asset limit: the pilot cap while the pilot runs, the plan limit after.
    const maxAssets = isPilotActive ? PILOT_MAX_ASSETS : (subscription?.plan?.max_assets || 100);

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
    } else if (['professional', 'business', 'enterprise'].includes(subscription?.plan?.slug || '')) {
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
        max_assets: maxAssets,
        limit_reached: currentAssets >= maxAssets,
      },
      days_remaining: daysRemaining,
      // Only an unpaid org is on a trial. A Stripe subscription exists solely
      // because someone paid, and a `trialing` status on one is our 90-day
      // service-term deferral, not a free trial -- showing "Essai, 90 jours"
      // to a customer who just paid EUR 14 400 reads as a billing error.
      // Defended here as well as in the webhook so a row written before that
      // fix, or by a future path, still cannot surface as a trial.
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

    // Get the new plan
    const { data: newPlan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('slug', plan_slug)
      .eq('is_active', true)
      .single();

    if (planError || !newPlan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Check asset limit before downgrade
    const { count: assetCount, error: countError } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    if (countError) {
      console.error('Error counting assets:', countError);
    }

    const currentAssets = assetCount || 0;

    if (currentAssets > newPlan.max_assets) {
      return NextResponse.json(
        { 
          error: 'Cannot downgrade',
          message: `You have ${currentAssets} assets but the ${newPlan.name} plan only allows ${newPlan.max_assets}. Please delete ${currentAssets - newPlan.max_assets} assets first.`
        },
        { status: 400 }
      );
    }

    // Update subscription
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + (billing_cycle === 'yearly' ? 365 : 30));

    const { data: updated, error: updateError } = await supabase
      .from('subscriptions')
      .update({
        plan_id: newPlan.id,
        billing_cycle: billing_cycle,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: currentPeriodEnd.toISOString(),
        trial_start: null,
        trial_end: null,
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', organizationId)
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { error: updateError.message || 'Failed to update subscription' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      subscription: updated,
      message: 'Subscription updated successfully'
    });

  } catch (error: any) {
    console.error('Subscription update error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}