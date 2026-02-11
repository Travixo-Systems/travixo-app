// app/api/subscriptions/route.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
      .select('id, name, is_pilot, pilot_start_date, pilot_end_date')
      .eq('id', organizationId)
      .single();

    if (orgError) {
      console.error('Organization lookup error:', orgError);
    }

    // Check current asset count
    const { count: assetCount, error: countError } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

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

    // Asset limit: 50 for active pilots, plan limit otherwise
    const maxAssets = isPilotActive ? 50 : (subscription?.plan?.max_assets || 100);

    // Determine VGP access level
    let vgp_access: 'full' | 'read_only' | 'blocked' = 'blocked';
    if (isPilotActive) {
      vgp_access = 'full';
    } else if (['professional', 'business', 'enterprise'].includes(subscription?.plan?.slug || '')) {
      vgp_access = 'full';
    } else if (isPilot && !isPilotActive) {
      // Expired pilot — read-only VGP
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
      is_trial: subscription?.status === 'trialing',
      is_pilot: isPilot,
      pilot_active: isPilotActive,
      pilot_end_date: org?.pilot_end_date || null,
      vgp_access,
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