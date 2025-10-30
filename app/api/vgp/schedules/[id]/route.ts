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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const scheduleId = resolvedParams.id;

    console.log('VGP Schedule GET: Fetching schedule', scheduleId);

    const { data: schedule, error } = await supabase
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
      .eq('id', scheduleId)
      .single();

    if (error) {
      console.error('VGP Schedule GET: Error fetching schedule', error);
      throw error;
    }

    if (!schedule) {
      return NextResponse.json(
        { error: 'Schedule not found' },
        { status: 404 }
      );
    }

    console.log('VGP Schedule GET: Schedule fetched successfully');

    return NextResponse.json({ schedule });

  } catch (error: any) {
    console.error('VGP Schedule GET: Error', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const scheduleId = resolvedParams.id;
    const body = await request.json();

    console.log('VGP Schedule PATCH: Updating schedule', scheduleId);

    const { data: schedule, error } = await supabase
      .from('vgp_schedules')
      .update({
        status: body.status,
        last_inspection_date: body.last_inspection_date,
        next_due_date: body.next_due_date,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId)
      .select()
      .single();

    if (error) {
      console.error('VGP Schedule PATCH: Error updating schedule', error);
      throw error;
    }

    console.log('VGP Schedule PATCH: Schedule updated successfully');

    return NextResponse.json({ success: true, schedule });

  } catch (error: any) {
    console.error('VGP Schedule PATCH: Error', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const scheduleId = resolvedParams.id;

    const { error } = await supabase
      .from('vgp_schedules')
      .delete()
      .eq('id', scheduleId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('VGP Schedule DELETE Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}