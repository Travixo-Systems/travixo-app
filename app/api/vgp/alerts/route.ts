import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { checkFeatureAccess } from '@/lib/billing/guard';

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
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {}
        },
      },
    }
  );
}

export async function GET(request: Request) {
  try {
    // Server-side feature gate: VGP requires Professional+ plan
    const denied = await checkFeatureAccess('vgp_compliance');
    if (denied) return denied;

    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const pending_only = searchParams.get('pending_only') === 'true';

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single();

    let query = supabase
      .from('vgp_alerts')
      .select(`
        *,
        assets (
          id,
          name,
          serial_number,
          category,
          location
        ),
        vgp_schedules (
          inspector_name,
          inspector_company
        )
      `)
      .eq('organization_id', userData?.organization_id)
      .order('alert_date', { ascending: true });

    if (pending_only) {
      query = query.eq('sent', false);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ alerts: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // Server-side feature gate: VGP requires Professional+ plan
    const denied = await checkFeatureAccess('vgp_compliance');
    if (denied) return denied;

    const supabase = await createClient();
    const { alert_ids } = await request.json();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Mark alerts as sent
    const { error } = await supabase
      .from('vgp_alerts')
      .update({
        sent: true,
        sent_at: new Date().toISOString()
      })
      .in('id', alert_ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
