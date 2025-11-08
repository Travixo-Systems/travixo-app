// app/api/subscriptions/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log('AUTH USER:', user?.id, user?.email); // ADD THIS
    
    const { data: userData, error: userDataError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();
    
    console.log('USER DATA:', userData); // ADD THIS
    console.log('USER DATA ERROR:', userDataError); // ADD THIS
    
    if (userDataError || !userData?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }
    const organizationId = userData.organization_id;

    // Get subscription details
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

    // Get current usage
    const { data: assets } = await supabase
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    const assetCount = assets || 0;

    // Check if pilot
    const { data: orgDetails } = await supabase
      .from('organizations')
      .select('is_pilot, pilot_start_date, pilot_end_date')
      .eq('id', organizationId)
      .single();

    const isPilotActive = 
      orgDetails?.is_pilot && 
      new Date() >= new Date(orgDetails.pilot_start_date) &&
      new Date() <= new Date(orgDetails.pilot_end_date);

    return NextResponse.json({
      subscription,
      usage: {
        assets: assetCount,
        max_assets: subscription.plan.max_assets
      },
      is_pilot: isPilotActive
    });

  } catch (error) {
    console.error('Subscription API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { plan_slug, billing_cycle = 'monthly' } = body;

    console.log('📝 Update subscription request:', { plan_slug, billing_cycle });

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get organization ID from users table
    const { data: userData, error: userDataError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (userDataError || !userData?.organization_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const organizationId = userData.organization_id;
    console.log('✅ Organization ID:', organizationId);

    // Get new plan
    const { data: newPlan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('slug', plan_slug)
      .eq('is_active', true)
      .single();

    if (planError || !newPlan) {
      console.error('❌ Plan not found:', planError);
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    console.log('✅ New plan found:', newPlan.name);

    // Check asset limit before downgrade - FIX: Use count properly
    const { count: assetCount, error: countError } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    console.log('📊 Current asset count:', assetCount);

    if (countError) {
      console.error('❌ Error counting assets:', countError);
    }

    const currentAssets = assetCount || 0;

    if (currentAssets > newPlan.max_assets) {
      console.log('❌ Asset limit exceeded');
      return NextResponse.json(
        { 
          error: 'Cannot downgrade',
          message: `You have ${currentAssets} assets but the ${newPlan.name} plan only allows ${newPlan.max_assets}. Please delete ${currentAssets - newPlan.max_assets} assets first.`
        },
        { status: 400 }
      );
    }

    // Update subscription
    const periodStart = new Date();
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + (billing_cycle === 'yearly' ? 365 : 30));

    console.log('🔄 Updating subscription...');

    const { data: updatedSub, error: updateError } = await supabase
      .from('subscriptions')
      .update({
        plan_id: newPlan.id,
        billing_cycle,
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        status: 'active',
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
      console.error('❌ Update error:', updateError);
      console.error('Error code:', updateError.code);
      console.error('Error message:', updateError.message);
      console.error('Error details:', updateError.details);
      return NextResponse.json(
        { error: updateError.message || 'Failed to update subscription' },
        { status: 500 }
      );
    }

    console.log('✅ Subscription updated successfully');

    return NextResponse.json({
      success: true,
      subscription: updatedSub
    });

  } catch (error: any) {
    console.error('❌ SUBSCRIPTION UPDATE ERROR:', error);
    console.error('ERROR MESSAGE:', error.message);
    console.error('ERROR STACK:', error.stack);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}