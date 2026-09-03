-- 20260902170000_pending_weekly_digests.sql
--
-- Queue table for weekly-digest recipients, plus the repair of the
-- organizations.notification_preferences recipients shape.
--
-- ---------------------------------------------------------------------------
-- PART 1: pending_weekly_digests
-- ---------------------------------------------------------------------------
-- A user on 'weekly_digest' should hear about an alert once a week, not once a
-- day. The daily cron therefore records their alerts here instead of sending,
-- and the Monday run drains the queue into a single email per user.
--
-- One row per (user, schedule, alert_type). The UNIQUE constraint is what makes
-- the daily accumulation idempotent: a schedule that stays in the same band for
-- six days inserts once and is ignored on the other five, so Monday's email
-- lists it a single time rather than six.
--
-- Rows are deleted only after the weekly email is accepted by Resend. Deleting
-- first would lose the week's alerts if the send failed, and for VGP that means
-- losing a compliance warning rather than merely a notification.
--
-- alert_type and urgency_level are denormalised onto the row on purpose. The
-- band a schedule occupied when the alert was queued is a fact about that
-- moment; recomputing it on Monday from the current next_due_date would report
-- the wrong band for anything that moved during the week.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pending_weekly_digests (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  organization_id UUID        NOT NULL,
  schedule_id     UUID        NOT NULL,
  asset_id        UUID,
  alert_type      TEXT        NOT NULL,
  urgency_level   TEXT,
  due_date        DATE        NOT NULL,
  days_until_due  INTEGER     NOT NULL,
  queued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pending_weekly_digests_pkey PRIMARY KEY (id),

  CONSTRAINT pending_weekly_digests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,

  CONSTRAINT pending_weekly_digests_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,

  CONSTRAINT pending_weekly_digests_schedule_id_fkey
    FOREIGN KEY (schedule_id) REFERENCES public.vgp_schedules(id) ON DELETE CASCADE,

  CONSTRAINT pending_weekly_digests_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,

  -- Makes daily accumulation idempotent across a week.
  CONSTRAINT pending_weekly_digests_dedup_key
    UNIQUE (user_id, schedule_id, alert_type)
);

COMMENT ON TABLE public.pending_weekly_digests IS
  'Alerts deferred for users on weekly_digest. Written by the daily VGP cron, '
  'drained by /api/cron/vgp-weekly-digest on Mondays. Rows are removed only '
  'after their email is accepted.';

-- The weekly run reads the whole queue grouped by user.
CREATE INDEX IF NOT EXISTS idx_pending_weekly_user
  ON public.pending_weekly_digests (user_id);

CREATE INDEX IF NOT EXISTS idx_pending_weekly_org
  ON public.pending_weekly_digests (organization_id);

ALTER TABLE public.pending_weekly_digests ENABLE ROW LEVEL SECURITY;

-- Users may see what is queued for them; nothing else is exposed. All writes
-- come from the cron via the service role, which bypasses RLS.
DROP POLICY IF EXISTS pending_weekly_select_own ON public.pending_weekly_digests;
CREATE POLICY pending_weekly_select_own
  ON public.pending_weekly_digests
  FOR SELECT
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.pending_weekly_digests FROM anon;
GRANT SELECT ON TABLE public.pending_weekly_digests TO authenticated;
GRANT ALL ON TABLE public.pending_weekly_digests TO service_role;

-- ---------------------------------------------------------------------------
-- PART 2: normalise notification_preferences -> vgp_alerts.recipients
-- ---------------------------------------------------------------------------
-- The column holds two shapes for the same key. The database default writes an
-- array:
--
--   '{"vgp_alerts": {"recipients": ["owner"], ...}}'
--
-- while app/api/settings/notifications validates `typeof === 'string'` and
-- writes a scalar. The cron switched on string equality, so an array matched no
-- case and fell through to the owner-only default. For ["owner"] that was
-- accidentally correct; for ["admin"] and ["all"] it silently narrowed the
-- recipient list, and those orgs have been getting fewer alerts than they asked
-- for.
--
-- The cron now normalises on read as well (lib/vgp/notification-routing.ts,
-- normalizeRecipientsPref), so this migration is the data half of a fix that
-- holds from both directions.

UPDATE public.organizations
   SET notification_preferences = jsonb_set(
         notification_preferences,
         '{vgp_alerts,recipients}',
         to_jsonb(notification_preferences -> 'vgp_alerts' ->> 'recipients')
       )
 WHERE jsonb_typeof(notification_preferences -> 'vgp_alerts' -> 'recipients') = 'array';

-- Note on the ->> above: applied to a JSON ARRAY it returns that array's text
-- form, e.g. '["admin"]', which would replace one wrong shape with another. The
-- statement below is the actual correction and runs immediately after, taking
-- element 0 for any row still not holding a plain role string.
UPDATE public.organizations
   SET notification_preferences = jsonb_set(
         notification_preferences,
         '{vgp_alerts,recipients}',
         to_jsonb(COALESCE(notification_preferences -> 'vgp_alerts' -> 'recipients' ->> 0, 'owner'))
       )
 WHERE notification_preferences -> 'vgp_alerts' ->> 'recipients' LIKE '[%';

-- Anything still not one of the three known roles becomes 'owner', which is
-- what the cron would have used anyway.
UPDATE public.organizations
   SET notification_preferences = jsonb_set(
         notification_preferences,
         '{vgp_alerts,recipients}',
         '"owner"'::jsonb
       )
 WHERE notification_preferences -> 'vgp_alerts' ? 'recipients'
   AND notification_preferences -> 'vgp_alerts' ->> 'recipients' NOT IN ('owner', 'admin', 'all');

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- 1. No array-shaped recipients remain (expect zero):
--
--   SELECT count(*) FROM public.organizations
--    WHERE jsonb_typeof(notification_preferences -> 'vgp_alerts' -> 'recipients') = 'array';
--
-- 2. Every remaining value is a known role (expect zero):
--
--   SELECT count(*) FROM public.organizations
--    WHERE notification_preferences -> 'vgp_alerts' ? 'recipients'
--      AND notification_preferences -> 'vgp_alerts' ->> 'recipients'
--          NOT IN ('owner', 'admin', 'all');
--
-- 3. Orgs that had chosen a wider audience kept it -- spot-check one that was
--    stored as ["all"] before this ran:
--
--   SELECT name, notification_preferences -> 'vgp_alerts' ->> 'recipients'
--     FROM public.organizations ORDER BY created_at DESC LIMIT 20;
--
-- 4. The queue starts empty and only the cron writes it:
--
--   SELECT count(*) FROM public.pending_weekly_digests;
