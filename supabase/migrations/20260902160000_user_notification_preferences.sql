-- 20260902160000_user_notification_preferences.sql
--
-- Per-user VGP alert delivery preferences, overriding the org-level defaults in
-- organizations.notification_preferences.
--
-- ---------------------------------------------------------------------------
-- WHY THE TABLE IS NOT CALLED notification_preferences
-- ---------------------------------------------------------------------------
-- organizations already has a JSONB COLUMN of that name, and the cron reads
-- both within a few lines of each other. A table sharing the column's name
-- would make `from('notification_preferences')` and `org.notification_
-- preferences` mean different things at adjacent call sites. The `user_` prefix
-- makes every read say which layer it is talking about.
--
-- ---------------------------------------------------------------------------
-- WHY A TABLE RATHER THAN MORE JSONB
-- ---------------------------------------------------------------------------
-- The org column already demonstrates the cost of storing this as JSONB: its
-- `recipients` key holds an ARRAY when written by the database default and a
-- STRING when written by the settings API, and nothing rejected either. The
-- cron read it as a scalar, so array rows matched no case and silently fell
-- back to owner-only -- narrowing the recipient list for any org that had
-- chosen "admin" or "all". 20260902170000 repairs that data.
--
-- A real table gets a CHECK constraint on vgp_frequency and NOT NULL on both
-- preference columns, so the same class of drift is rejected at write time.
--
-- ---------------------------------------------------------------------------
-- THRESHOLDS
-- ---------------------------------------------------------------------------
-- vgp_thresholds holds FREQUENCY_RULES.preferenceDay values, not day counts.
-- The mapping is deliberately not one-to-one with "days remaining":
--
--   30 -> planning   band, 30-60 days out
--   15 -> attention  band, 15-29 days out
--    7 -> urgent     band, 7-14 days out
--    1 -> critical   band, 0-6 days out
--    0 -> overdue    band, past due
--
-- So unchecking "7 jours" silences the whole 7-14 window, which is what the
-- checkbox means to a user. 0 is included in the default: overdue mail was
-- previously unconditional, and a user who wants to opt out of it now can.
--
-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- SELECT and UPDATE are restricted to the caller's own row. INSERT additionally
-- verifies that the caller actually belongs to the organization named in the
-- row -- without that check a user could create a preference row pointing at an
-- organization they have no membership in. DELETE is deliberately absent:
-- clearing preferences means reverting to org defaults, which the application
-- expresses by writing values, and rows disappear with the user or org via the
-- cascades below.
--
-- No policy grants cross-user reads. The cron reads this table through the
-- service role, which bypasses RLS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  organization_id UUID        NOT NULL,
  vgp_frequency   TEXT        NOT NULL DEFAULT 'daily_digest',
  vgp_thresholds  INTEGER[]   NOT NULL DEFAULT '{30,15,7,1,0}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_notification_preferences_pkey PRIMARY KEY (id),

  CONSTRAINT user_notification_preferences_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,

  CONSTRAINT user_notification_preferences_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,

  CONSTRAINT user_notification_preferences_user_org_key
    UNIQUE (user_id, organization_id),

  CONSTRAINT user_notification_preferences_vgp_frequency_check
    CHECK (vgp_frequency IN ('immediate', 'daily_digest', 'weekly_digest', 'off'))
);

COMMENT ON TABLE public.user_notification_preferences IS
  'Per-user VGP alert delivery preferences. Overrides organizations.'
  'notification_preferences, which remains the default when no row exists.';

COMMENT ON COLUMN public.user_notification_preferences.vgp_thresholds IS
  'FREQUENCY_RULES.preferenceDay values, not day counts: 30/15/7/1/0 identify '
  'the planning/attention/urgent/critical/overdue bands respectively.';

-- The cron's hot path: every recipient of every org, once per run.
CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_org
  ON public.user_notification_preferences (organization_id);

-- Skip the 'off' cohort without reading their rows.
CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_active
  ON public.user_notification_preferences (organization_id, vgp_frequency)
  WHERE vgp_frequency <> 'off';

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Own row only.
DROP POLICY IF EXISTS user_notif_prefs_select_own ON public.user_notification_preferences;
CREATE POLICY user_notif_prefs_select_own
  ON public.user_notification_preferences
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_notif_prefs_update_own ON public.user_notification_preferences;
CREATE POLICY user_notif_prefs_update_own
  ON public.user_notification_preferences
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Insert own row, and only against an org the caller actually belongs to.
DROP POLICY IF EXISTS user_notif_prefs_insert_own ON public.user_notification_preferences;
CREATE POLICY user_notif_prefs_insert_own
  ON public.user_notification_preferences
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid()
         AND u.organization_id = user_notification_preferences.organization_id
    )
  );

-- anon has no business here at all. Default privileges in this project hand
-- EXECUTE and table rights to anon automatically (see
-- supabase/schemas/public/default_privileges.sql and migration 20260902120000),
-- so the revoke has to be explicit rather than assumed.
REVOKE ALL ON TABLE public.user_notification_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_notification_preferences TO authenticated;
GRANT ALL ON TABLE public.user_notification_preferences TO service_role;

-- Keep updated_at honest.
DROP TRIGGER IF EXISTS update_user_notif_prefs_updated_at ON public.user_notification_preferences;
CREATE TRIGGER update_user_notif_prefs_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- 1. Constraints are in place:
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'public.user_notification_preferences'::regclass
--    ORDER BY conname;
--
--   Expect the CHECK on vgp_frequency, the UNIQUE (user_id, organization_id),
--   and both FKs with ON DELETE CASCADE.
--
-- 2. An invalid frequency is refused:
--
--   INSERT INTO public.user_notification_preferences (user_id, organization_id, vgp_frequency)
--   VALUES ('<user-uuid>', '<org-uuid>', 'hourly');
--
--   Expect: violates check constraint.
--
-- 3. anon holds nothing:
--
--   SELECT grantee, privilege_type
--     FROM information_schema.role_table_grants
--    WHERE table_name = 'user_notification_preferences';
--
--   Expect authenticated and service_role only.
--
-- 4. A member cannot write a row for another organization -- as that member:
--
--   INSERT INTO public.user_notification_preferences (user_id, organization_id)
--   VALUES (auth.uid(), '<some-other-org-uuid>');
--
--   Expect: new row violates row-level security policy.
