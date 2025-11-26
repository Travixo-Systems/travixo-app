// app/api/vgp/report/route.ts
// DIRECCTE-compliant VGP report generation

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import { generateVGPReport } from "@/lib/pdf-generator";

const INSPECTION_FIELDS = `
  id,
  inspection_date,
  inspector_name,
  inspector_company,
  verification_type,    
  observations,         
  certification_number,
  result,
  next_inspection_date,
  certificate_url,
  organization_id,
  assets (
    id,
    name,
    serial_number,
    asset_categories ( name )
  ),
  organizations ( name )
`;

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
          } catch (_) {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch (_) {}
        },
      },
    }
  );
}

// ------------------ POST = Generate PDF Report ------------------
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's organization
    const { data: profile, error: profileErr } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile?.organization_id) {
      return NextResponse.json(
        { error: "Impossible de déterminer l'organisation de l'utilisateur" },
        { status: 400 }
      );
    }

    // Get date range from request
    const body = await request.json();
    const { start_date, end_date } = body as {
      start_date?: string;
      end_date?: string;
    };

    if (!start_date || !end_date) {
      return NextResponse.json(
        { error: "start_date and end_date are required" },
        { status: 400 }
      );
    }

    // Fetch inspections for the period
    const { data: inspections, error: inspectionsError } = await supabase
      .from("vgp_inspections")
      .select(INSPECTION_FIELDS)
      .eq("organization_id", profile.organization_id)
      .gte("inspection_date", start_date)
      .lte("inspection_date", end_date)
      .order("inspection_date", { ascending: false });

    if (inspectionsError) {
      console.error(
        "VGP Report POST: Error fetching inspections",
        inspectionsError
      );
      return NextResponse.json(
        { error: "Erreur lors de la récupération des inspections" },
        { status: 500 }
      );
    }

    // Get organization name
    let orgName = "Organisation";
    
    if (inspections && inspections.length > 0) {
      // Try to get org name from inspection join
      orgName = (inspections[0] as any).organizations?.name || orgName;
    }
    
    // Fallback: fetch from organizations table
    if (orgName === "Organisation") {
      const { data: orgRow } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", profile.organization_id)
        .maybeSingle();

      if (orgRow?.name) {
        orgName = orgRow.name;
      }
    }

    // Calculate overdue equipment
    const todayIso = new Date().toISOString().split("T")[0];
    const { data: overdueSchedules } = await supabase
      .from("vgp_schedules")
      .select(`
        id,
        asset_id,
        next_due_date,
        last_inspection_date,
        assets (
          id,
          name,
          serial_number,
          asset_categories ( name )
        )
      `)
      .eq("organization_id", profile.organization_id)
      .lt("next_due_date", todayIso)
      .eq("archived", false);

    // Map to overdue equipment format
    const overdueEquipment = (overdueSchedules || []).map((schedule: any) => {
      const dueDate = new Date(schedule.next_due_date);
      const now = new Date(todayIso);
      const diffTime = now.getTime() - dueDate.getTime();
      const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return {
        internal_id: schedule.asset_id,
        name: schedule.assets?.name || "N/A",
        serial_number: schedule.assets?.serial_number || "N/A",
        category: schedule.assets?.asset_categories?.name || "N/A",
        last_vgp_date: schedule.last_inspection_date || "N/A",
        next_due_date: schedule.next_due_date,
        days_overdue: daysOverdue,
      };
    });

    // Generate PDF (works with 0 or more inspections)
    const pdfBuffer = generateVGPReport(
      {
        name: orgName,
        siret: "N/A",
        address: "N/A",
        contact: user.email || "N/A",
      },
      inspections || [],
      overdueEquipment,
      start_date,
      end_date
    );

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rapport-vgp-direccte-${start_date}-${end_date}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    console.error("VGP Report POST: Error", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate report" },
      { status: 500 }
    );
  }
}

// ------------------ GET = Preview/Metadata ------------------
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile?.organization_id) {
      return NextResponse.json(
        { error: "Impossible de déterminer l'organisation de l'utilisateur" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    // Preview mode: return inspections for date range
    if (startDate && endDate) {
      const { data: inspections, error } = await supabase
        .from("vgp_inspections")
        .select(INSPECTION_FIELDS)
        .eq("organization_id", profile.organization_id)
        .gte("inspection_date", startDate)
        .lte("inspection_date", endDate)
        .order("inspection_date", { ascending: false });

      if (error) {
        console.error("VGP Report GET: Error fetching inspections", error);
        return NextResponse.json(
          { error: "Erreur lors de la récupération des inspections" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        inspections: inspections || [],
      });
    }

    // Metadata mode: return date range
    const { data: dates, error: datesErr } = await supabase
      .from("vgp_inspections")
      .select("inspection_date")
      .eq("organization_id", profile.organization_id)
      .order("inspection_date", { ascending: true });

    if (datesErr) {
      console.error("VGP Report GET: Error fetching dates", datesErr);
      return NextResponse.json(
        { error: "Erreur lors de la récupération des dates" },
        { status: 500 }
      );
    }

    if (!dates || dates.length === 0) {
      return NextResponse.json({
        earliest_date: null,
        latest_date: null,
        total_inspections: 0,
      });
    }

    return NextResponse.json({
      earliest_date: dates[0].inspection_date,
      latest_date: dates[dates.length - 1].inspection_date,
      total_inspections: dates.length,
    });
  } catch (error: any) {
    console.error("VGP Report GET: Error", error);
    return NextResponse.json(
      { error: error?.message || "Server error" },
      { status: 500 }
    );
  }
}