// app/api/vgp/compliance-summary/route.ts

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { requireFeature } from '@/lib/server/require-feature';

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

    // Feature gate: require vgp_compliance (also handles auth + org lookup)
    const { denied, organizationId } = await requireFeature(supabase, 'vgp_compliance');
    if (denied) return denied;

    // Fetch ALL NON-ARCHIVED schedules with asset details
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
      .eq('organization_id', organizationId!)
      .is('archived_at', null)
      .order('next_due_date', { ascending: true });

    if (schedulesError) {
      console.error('[VGP] Schedule fetch failed:', schedulesError.message);
      throw schedulesError;
    }

    const scheduleCount = allSchedules?.length || 0;
    
    // TODO: REMOVE before live demo - debug logging
    console.log('[VGP] Loaded schedules:', scheduleCount);

    // Calculate dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    thirtyDaysFromNow.setHours(23, 59, 59, 999);

    // Categorize schedules based on dates
    const upcomingSchedules: any[] = [];
    const overdueSchedules: any[] = [];
    let compliantCount = 0;

    allSchedules?.forEach((schedule) => {
      const dueDate = new Date(schedule.next_due_date);
      dueDate.setHours(0, 0, 0, 0);
      
      const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil < 0) {
        overdueSchedules.push(schedule);
      } else if (daysUntil >= 0 && daysUntil <= 30) {
        upcomingSchedules.push(schedule);
      } else if (daysUntil > 30 && daysUntil <= 90) {
        upcomingSchedules.push(schedule);
      } else {
        compliantCount++;
      }
    });

    const total_assets_with_vgp = scheduleCount;
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

    // TODO: REMOVE before live demo - debug logging
    console.log('[VGP] Summary breakdown:', {
      total: summary.total_assets_with_vgp,
      compliant: summary.compliant_assets,
      overdue: summary.overdue_assets,
      upcoming: summary.due_soon_assets,
      rate: summary.compliance_rate + '%'
    });

    return NextResponse.json({
      summary,
      upcoming: upcomingSchedules,
      overdue: overdueSchedules
    });

  } catch (error: any) {
    console.error('[VGP] Compliance summary error:', error?.message || 'Unknown error');
    return NextResponse.json(
      { error: error.message || 'Internal server error' }, 
      { status: 500 }
    );
  }
}