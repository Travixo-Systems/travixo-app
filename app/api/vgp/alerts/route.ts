import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
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
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const pending_only = searchParams.get('pending_only') === 'true';

  // Feature gate: require vgp_compliance
  const { denied, organizationId } = await requireFeature(supabase, 'vgp_compliance');
  if (denied) return denied;

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
    .eq('organization_id', organizationId!)
    .order('alert_date', { ascending: true });

  if (pending_only) {
    query = query.eq('sent', false);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alerts: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { alert_ids } = await request.json();

  // Feature gate: require vgp_compliance
  const { denied } = await requireFeature(supabase, 'vgp_compliance');
  if (denied) return denied;

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
}
