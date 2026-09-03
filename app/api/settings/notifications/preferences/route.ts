// app/api/settings/notifications/preferences/route.ts
//
// Per-USER VGP alert preferences. The sibling route one level up
// (../route.ts) manages the ORGANIZATION's defaults and is owner/admin only;
// this one is every member's control over their own mail, so it deliberately
// carries no role check.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  VGP_FREQUENCIES,
  VGP_THRESHOLDS,
  DEFAULT_FREQUENCY,
  resolveRecipientPreference,
  normalizeRecipientsPref,
  type VGPFrequency,
  type UserNotificationPreferenceRow,
} from '@/lib/vgp/notification-routing';

const LOG_PREFIX = '[USER-NOTIF-PREFS]';

/**
 * The shape this route reads out of organizations.notification_preferences.
 *
 * Every field is optional: the column is JSONB with no schema, and rows written
 * before a key existed simply lack it. `recipients` is deliberately `unknown` --
 * it holds a string in some rows and an array in others, which is exactly the
 * drift normalizeRecipientsPref() exists to absorb.
 */
interface OrgNotificationPreferencesJson {
  email_enabled?: boolean;
  vgp_alerts?: {
    enabled?: boolean;
    timing?: number[];
    recipients?: unknown;
  };
}

interface ValidatedBody {
  vgp_frequency: VGPFrequency;
  vgp_thresholds: number[];
}

/**
 * Validate the request body.
 *
 * Rejects rather than coerces. The cron is defensive about what it reads
 * because it must cope with historical rows, but accepting a bad value here
 * would write one -- and a user who saw "saved" while their choice was quietly
 * changed has been misled.
 */
function validateBody(body: unknown): { ok: true; value: ValidatedBody } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Body must be an object' };
  }

  const { vgp_frequency, vgp_thresholds } = body as Record<string, unknown>;

  if (typeof vgp_frequency !== 'string' || !(VGP_FREQUENCIES as readonly string[]).includes(vgp_frequency)) {
    return {
      ok: false,
      error: `Invalid vgp_frequency. Must be one of: ${VGP_FREQUENCIES.join(', ')}`,
    };
  }

  if (!Array.isArray(vgp_thresholds)) {
    return { ok: false, error: 'vgp_thresholds must be an array' };
  }

  for (const t of vgp_thresholds) {
    if (typeof t !== 'number' || !Number.isInteger(t) || !VGP_THRESHOLDS.includes(t)) {
      return {
        ok: false,
        error: `Invalid threshold ${JSON.stringify(t)}. Must be one of: ${VGP_THRESHOLDS.join(', ')}`,
      };
    }
  }

  // An empty selection is accepted rather than rejected: it is a coherent
  // choice, and the UI can reach it by unchecking every box. It behaves as
  // silence for that user without them needing to also switch to 'off'.
  const unique = [...new Set(vgp_thresholds as number[])].sort((a, b) => b - a);

  return { ok: true, value: { vgp_frequency: vgp_frequency as VGPFrequency, vgp_thresholds: unique } };
}

/** The caller's identity plus their org, or a ready-made error response. */
async function getCaller(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single<{ organization_id: string }>();

  if (userError || !userData?.organization_id) {
    return { error: NextResponse.json({ error: 'Organization not found' }, { status: 404 }) };
  }

  return { userId: user.id, organizationId: userData.organization_id };
}

// GET /api/settings/notifications/preferences
//
// Returns the caller's effective settings and whether they are their own or
// inherited, so the UI can show org defaults without pretending the user has
// already chosen them.
export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await getCaller(supabase);
    if ('error' in caller) return caller.error;

    const { data: row } = await supabase
      .from('user_notification_preferences')
      .select('user_id, organization_id, vgp_frequency, vgp_thresholds')
      .eq('user_id', caller.userId)
      .eq('organization_id', caller.organizationId)
      .maybeSingle();

    const { data: org } = await supabase
      .from('organizations')
      .select('notification_preferences')
      .eq('id', caller.organizationId)
      .single<{ notification_preferences: OrgNotificationPreferencesJson }>();

    const np = org?.notification_preferences;
    const orgDefaults = {
      timing: Array.isArray(np?.vgp_alerts?.timing) ? np.vgp_alerts.timing : [30, 15, 7, 1],
      enabled: (np?.email_enabled ?? true) && (np?.vgp_alerts?.enabled ?? true),
    };

    const resolved = resolveRecipientPreference(
      row as UserNotificationPreferenceRow | null,
      orgDefaults
    );

    return NextResponse.json({
      preferences: {
        vgp_frequency: resolved.frequency,
        vgp_thresholds: resolved.thresholds,
      },
      // False means these are org defaults the user has not overridden.
      is_user_override: resolved.fromUserRow,
      org_defaults: {
        timing: orgDefaults.timing,
        enabled: orgDefaults.enabled,
        recipients: normalizeRecipientsPref(np?.vgp_alerts?.recipients),
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} GET failed:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/settings/notifications/preferences
//
// Upsert the caller's own row.
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();

    // NOTE: deliberately no requireWriteAccess() gate here, unlike the
    // org-level route. That gate freezes the app when a pilot expires, and
    // freezing someone's ability to STOP receiving email would turn an expired
    // trial into unstoppable mail. Opting out must stay available.

    const caller = await getCaller(supabase);
    if ('error' in caller) return caller.error;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = validateBody(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // user_id and organization_id come from the session, never from the body:
    // taking them from the request would let a caller write another user's
    // preferences. RLS would refuse it, but the API should not be asking.
    const { data: saved, error: upsertError } = await supabase
      .from('user_notification_preferences')
      .upsert(
        {
          user_id: caller.userId,
          organization_id: caller.organizationId,
          vgp_frequency: validation.value.vgp_frequency,
          vgp_thresholds: validation.value.vgp_thresholds,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: 'user_id,organization_id' }
      )
      .select('vgp_frequency, vgp_thresholds')
      .single<{ vgp_frequency: string; vgp_thresholds: number[] }>();

    if (upsertError || !saved) {
      console.error(`${LOG_PREFIX} Upsert failed:`, upsertError?.message);
      return NextResponse.json(
        { error: 'Failed to save notification preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Notification preferences updated',
      preferences: {
        vgp_frequency: saved.vgp_frequency ?? DEFAULT_FREQUENCY,
        vgp_thresholds: saved.vgp_thresholds ?? [],
      },
      is_user_override: true,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} PATCH failed:`, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
