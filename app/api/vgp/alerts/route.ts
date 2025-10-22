export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });
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
    .eq('organization_id', userData.organization_id)
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
  const supabase = createRouteHandlerClient({ cookies });
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
}
