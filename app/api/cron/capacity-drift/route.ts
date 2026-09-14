// app/api/cron/capacity-drift/route.ts
//
// Report organizations whose billable asset count exceeds the capacity they
// licensed.
//
// REPORT ONLY. This route performs ZERO Stripe writes, by design. Drift is a
// billing conversation, not something to silently true up: raising a customer's
// quantity because their fleet grew would hand them an invoice they never
// agreed to. The capacity route exists for that, and only a human initiates it.
//
// Drift should be rare -- the asset-limit trigger refuses inserts past licensed
// capacity -- so a non-empty report means something bypassed that trigger:
// service-role writes, a direct SQL insert, a seed script, or capacity
// decreasing at period end while the fleet stayed put. Each is worth seeing.

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/node";

/** Matches the other crons: a slow account must not consume the run. */
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LOG_PREFIX = "[CAPACITY-DRIFT]";

interface DriftRow {
  organization_id: string;
  organization_name: string | null;
  licensed_capacity: number;
  billable_assets: number;
  over_by: number;
}

async function findDrift(): Promise<{
  checked: number;
  drifted: DriftRow[];
}> {
  // Only rows carrying a licence. NULL licensed_capacity means no Stripe
  // subscription (pilot or trial), which the pilot allowance governs instead --
  // comparing those against a capacity they never bought would report fiction.
  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select("organization_id, licensed_capacity, organizations(name)")
    .not("licensed_capacity", "is", null)
    .in("status", ["active", "trialing", "past_due"]);

  if (error) throw new Error(`subscriptions query failed: ${error.message}`);

  const drifted: DriftRow[] = [];

  for (const sub of subs || []) {
    // Billable excludes demo data and archived assets, matching exactly what
    // checkout counts when it sizes the licence. The NULL trap applies here
    // too: is_demo_data is nullable, so an .eq(false) would drop legacy rows
    // and under-report drift.
    const { count, error: countError } = await supabase
      .from("assets")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", sub.organization_id)
      .is("archived_at", null)
      .or("is_demo_data.eq.false,is_demo_data.is.null");

    if (countError) {
      console.log(
        `${LOG_PREFIX} count failed for org ${sub.organization_id}: ${countError.message}`
      );
      continue;
    }

    const billable = count || 0;
    const licensed = sub.licensed_capacity as number;

    if (billable > licensed) {
      // PostgREST returns an embedded relation as an array even for a
      // to-one FK, so this is [{name}] rather than {name}.
      const orgs = sub.organizations as unknown as { name: string | null }[] | null;
      drifted.push({
        organization_id: sub.organization_id,
        organization_name: orgs?.[0]?.name ?? null,
        licensed_capacity: licensed,
        billable_assets: billable,
        over_by: billable - licensed,
      });
    }
  }

  return { checked: (subs || []).length, drifted };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log(`${LOG_PREFIX} Unauthorized request - invalid CRON_SECRET`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { checked, drifted } = await findDrift();

    if (drifted.length > 0) {
      // Surfaced rather than merely logged: a customer using more than they
      // licensed is a revenue question someone has to answer.
      Sentry.captureMessage(
        `Capacity drift: ${drifted.length} organization(s) over licensed capacity`,
        {
          level: "warning",
          tags: { area: "billing", check: "capacity_drift" },
          extra: { drifted },
        }
      );
      for (const d of drifted) {
        console.log(
          `${LOG_PREFIX} org=${d.organization_id} (${d.organization_name ?? "unnamed"}) ` +
            `billable=${d.billable_assets} licensed=${d.licensed_capacity} over_by=${d.over_by}`
        );
      }
    } else {
      console.log(`${LOG_PREFIX} no drift across ${checked} licensed subscription(s)`);
    }

    return NextResponse.json({
      success: true,
      checked,
      drifted_count: drifted.length,
      drifted,
      stripe_writes: 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`${LOG_PREFIX} Unexpected error:`, msg);
    Sentry.captureException(error, {
      tags: { area: "billing", check: "capacity_drift" },
    });
    return NextResponse.json(
      { success: false, error: msg, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
