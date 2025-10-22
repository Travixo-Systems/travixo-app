// app/api/vgp/compliance-summary/route.ts
// REPLACE YOUR ENTIRE FILE WITH THIS - FIXED DATE LOGIC

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
          } catch (error) {
            // Handle cookie setting errors
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            // Handle cookie removal errors
          }
        },
      },
    }
  );
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    
    console.log('🔐 Starting VGP compliance summary fetch...');
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    if (userError || !userData?.organization_id) {
      console.error('User lookup error:', userError);
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    console.log('✅ User org:', userData.organization_id);

    // Fetch ALL schedules with asset details
    const { data: allSchedules, error: schedulesError } = await supabase
      .from('vgp_schedules')
      .select(`
        *,
        assets (
          id,
          name,
          serial_number,
          current_location,
          asset_categories (
            name
          )
        )
      `)
      .eq('organization_id', userData.organization_id)
      .order('next_due_date', { ascending: true });

    if (schedulesError) {
      console.error('❌ Schedules error:', schedulesError);
      throw schedulesError;
    }

    console.log(`📊 Found ${allSchedules?.length || 0} total schedules`);

    // Calculate dates
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    thirtyDaysFromNow.setHours(23, 59, 59, 999); // End of day 30

    console.log('📅 Today:', today.toISOString().split('T')[0]);
    console.log('📅 30 days from now:', thirtyDaysFromNow.toISOString().split('T')[0]);

    // Categorize schedules based on dates (IGNORE status field for now)
    const upcomingSchedules: any[] = [];
    const overdueSchedules: any[] = [];
    let compliantCount = 0;

    allSchedules?.forEach((schedule) => {
      const dueDate = new Date(schedule.next_due_date);
      dueDate.setHours(0, 0, 0, 0);
      
      const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      console.log(`📋 Schedule ${schedule.id}:`, {
        asset: schedule.assets?.name,
        due_date: schedule.next_due_date,
        days_until: daysUntil,
        status: schedule.status
      });

      if (daysUntil < 0) {
        // Overdue
        overdueSchedules.push(schedule);
      } else if (daysUntil >= 0 && daysUntil <= 30) {
        // Upcoming (next 30 days)
        upcomingSchedules.push(schedule);
      } else if (daysUntil > 30 && daysUntil <= 90) {
        // Soon (31-90 days) - also show in upcoming for better visibility
        upcomingSchedules.push(schedule);
      } else {
        // Future (more than 90 days away) = compliant
        compliantCount++;
      }
    });

    const total_assets_with_vgp = allSchedules?.length || 0;
    const compliance_rate = total_assets_with_vgp > 0 
      ? Math.round((compliantCount / total_assets_with_vgp) * 100) 
      : 100;

    const summary = {
      total_assets_with_vgp,
      compliant_assets: compliantCount,
      overdue_assets: overdueSchedules.length,
      due_soon_assets: upcomingSchedules.length,
      compliance_rate
    };

    console.log('📊 Summary:', summary);
    console.log(`📅 Upcoming: ${upcomingSchedules.length} schedules`);
    console.log(`⚠️  Overdue: ${overdueSchedules.length} schedules`);

    return NextResponse.json({
      summary,
      upcoming: upcomingSchedules,
      overdue: overdueSchedules
    });

  } catch (error: any) {
    console.error('❌ VGP Compliance Summary Error:', error);
    return NextResponse.json(
      { error: error.message }, 
      { status: 500 }
    );
  }
}