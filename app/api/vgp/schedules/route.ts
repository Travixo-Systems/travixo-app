// app/api/vgp/schedules/route.ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireFeature, requireVGPWriteAccess } from "@/lib/server/require-feature";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

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
            cookieStore.set({ name, value: "", ...options });
          } catch {}
        },
      },
    }
  );
}

function parseIntSafe(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

function isoDateOnly(d: Date) {
  return d.toISOString().split("T")[0];
}

// GET /api/vgp/schedules?status=&due_before=&due_after=&page=&limit=&include_archived=
export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // Feature gate: require vgp_compliance (also handles auth + org lookup)
    const { denied, organizationId } = await requireFeature(supabase, 'vgp_compliance');
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const dueBefore = searchParams.get("due_before") || undefined;
    const dueAfter = searchParams.get("due_after") || undefined;
    const includeArchived = searchParams.get("include_archived") === "true";
    const page = Math.max(1, parseIntSafe(searchParams.get("page")) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseIntSafe(searchParams.get("limit")) || 50)
    );
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("vgp_schedules")
      .select(
        `
        id,
        asset_id,
        organization_id,
        interval_months,
        last_inspection_date,
        next_due_date,
        status,
        notes,
        archived_at,
        created_at,
        updated_at,
        assets (
          id,
          name,
          serial_number,
          current_location,
          qr_code,
          asset_categories (
            name
          )
        )
      `,
        { count: "exact" }
      )
      .eq("organization_id", organizationId!)
      .order("next_due_date", { ascending: true })
      .order("id", { ascending: true });

    // Filter out archived by default
    if (!includeArchived) {
      query = query.is("archived_at", null);
    }

    // Apply all filters independently
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (dueBefore) {
      query = query.lte("next_due_date", dueBefore);
    }
    if (dueAfter) {
      query = query.gte("next_due_date", dueAfter);
    }
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) return json({ error: error.message }, 500);

    return json({
      schedules: data ?? [],
      page,
      limit,
      total: count ?? 0,
      has_more: typeof count === "number" ? to + 1 < count : false,
    });
  } catch (e: any) {
    return json({ error: "Internal server error", debug: e?.message }, 500);
  }
}

// POST /api/vgp/schedules
// body: { asset_id: string, interval_months: number|string, last_inspection_date?: string(yyyy-mm-dd) }
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Feature gate: require VGP write access (blocks expired pilots)
    const { denied, organizationId } = await requireVGPWriteAccess(supabase);
    if (denied) return denied;

    const body = await request.json().catch(() => ({}));
    const asset_id = body?.asset_id as string;
    const months = parseIntSafe(body?.interval_months);
    const last_inspection_date =
      (body?.last_inspection_date as string | undefined) || undefined;

    if (!asset_id || !months || months < 1)
      return json(
        { error: "Missing or invalid: asset_id, interval_months" },
        400
      );

    let baseDate: Date;
    if (last_inspection_date) {
      const d = new Date(last_inspection_date);
      if (Number.isNaN(d.getTime()))
        return json({ error: "Invalid last_inspection_date" }, 400);
      baseDate = d;
    } else {
      baseDate = new Date();
    }

    const nextDue = new Date(baseDate);
    nextDue.setHours(12, 0, 0, 0);
    nextDue.setMonth(nextDue.getMonth() + months);

    const { data: schedule, error: insertError } = await supabase
      .from("vgp_schedules")
      .insert({
        asset_id,
        organization_id: organizationId!,
        interval_months: months,
        last_inspection_date: last_inspection_date ?? null,
        next_due_date: isoDateOnly(nextDue),
        status: "active",
      })
      .select(
        `
        id,
        asset_id,
        organization_id,
        interval_months,
        last_inspection_date,
        next_due_date,
        status,
        created_at,
        updated_at
      `
      )
      .single();

    if (insertError) throw insertError;

    return json({ schedule }, 201);
  } catch (e: any) {
    return json({ error: "Internal server error", debug: e?.message }, 500);
  }
}
