import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { requireFeature, requireVGPWriteAccess } from '@/lib/server/require-feature';

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

    // Feature gate: require vgp_compliance (also handles auth + org lookup)
    const { denied } = await requireFeature(supabase, 'vgp_compliance');
    if (denied) return denied;

    const resolvedParams = await params;
    const scheduleId = resolvedParams.id;

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

    // Feature gate: require VGP write access (blocks expired pilots)
    const { denied } = await requireVGPWriteAccess(supabase);
    if (denied) return denied;

    // Need user.id for audit trail
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const scheduleId = resolvedParams.id;
    const body = await request.json();

    // Check if this is inspection update (existing behavior) or edit request (new behavior)
    if (body.status || body.last_inspection_date) {
      // Existing inspection update logic - UNCHANGED
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

      if (error) throw error;
      return NextResponse.json({ success: true, schedule });
    }

    // New: Edit with audit trail
    const { next_due_date, notes, reason } = body;

    const { data: currentSchedule, error: fetchError } = await supabase
      .from('vgp_schedules')
      .select('*')
      .eq('id', scheduleId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const editEntry = {
      edited_at: new Date().toISOString(),
      edited_by: user.id,
      changes: [] as any[],
      reason: reason || 'No reason provided'
    };

    const updates: any = { updated_at: new Date().toISOString() };

    if (next_due_date && next_due_date !== currentSchedule.next_due_date) {
      editEntry.changes.push({
        field: 'next_due_date',
        old_value: currentSchedule.next_due_date,
        new_value: next_due_date
      });
      updates.next_due_date = next_due_date;
    }

    if (notes !== undefined && notes !== currentSchedule.notes) {
      editEntry.changes.push({
        field: 'notes',
        old_value: currentSchedule.notes,
        new_value: notes
      });
      updates.notes = notes;
    }

    if (editEntry.changes.length > 0) {
      const currentHistory = currentSchedule.edit_history || [];
      updates.edit_history = [...currentHistory, editEntry];
    }

    const { data, error } = await supabase
      .from('vgp_schedules')
      .update(updates)
      .eq('id', scheduleId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ schedule: data });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();

    // Feature gate: require VGP write access (blocks expired pilots)
    const { denied } = await requireVGPWriteAccess(supabase);
    if (denied) return denied;

    // Need user.id for archived_by
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const scheduleId = resolvedParams.id;
    const body = await request.json().catch(() => ({ reason: 'No reason provided' }));

    // Soft delete - archive instead of delete
    const { data, error } = await supabase
      .from('vgp_schedules')
      .update({
        archived_at: new Date().toISOString(),
        archived_by: user.id,
        archive_reason: body.reason || 'No reason provided'
      })
      .eq('id', scheduleId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, schedule: data }, { status: 200 });

  } catch (error: any) {
    console.error('VGP Schedule DELETE Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}