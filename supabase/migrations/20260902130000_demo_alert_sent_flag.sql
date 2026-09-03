-- 20260902130000_demo_alert_sent_flag.sql
--
-- Add organizations.demo_alert_sent, the one-shot guard for the demo showcase
-- email introduced alongside the cron's demo-asset exclusion.
--
-- ---------------------------------------------------------------------------
-- WHY A COLUMN RATHER THAN A LOG LOOKUP
-- ---------------------------------------------------------------------------
-- The showcase email must go out exactly once per organization, and the caller
-- is a fire-and-forget fetch from the browser that can be issued more than once
-- for a single signup. There is no email send-log table to consult, and Resend
-- holds no per-org state we can query cheaply from the request path.
--
-- A boolean on organizations makes the guard a single conditional UPDATE:
--
--   UPDATE organizations
--      SET demo_alert_sent = true
--    WHERE id = $1 AND demo_alert_sent = false
--   RETURNING id;
--
-- Postgres takes a row lock for the duration of that statement, so of two
-- concurrent callers exactly one sees a returned row. The other gets zero rows
-- and skips. That is what makes the guard hold under the race, which a
-- read-then-write pair would not: both readers would see false and both would
-- send.
--
-- The flag is claimed BEFORE the send, so a send that fails does not retry.
-- That is the intended trade. This email is a convenience; a duplicate is worse
-- than a miss, because a second "example alert" landing days later reads as a
-- real compliance notice.
--
-- ---------------------------------------------------------------------------
-- BACKFILL
-- ---------------------------------------------------------------------------
-- Existing organizations are set to TRUE, not the column default. They already
-- completed onboarding, and several have had the seeded overdue Toyota emailing
-- them daily through the cron -- they have seen the alert format many times
-- over. Defaulting them to false would send a "here is an example" email to
-- established accounts, which is the opposite of the intent.
--
-- New rows get false from the column default and receive the email normally.

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS demo_alert_sent BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.demo_alert_sent IS
  'True once the one-time demo showcase alert email has been claimed for this '
  'org. Claimed via a conditional UPDATE before the send, so it is a one-shot '
  'guard rather than a delivery receipt.';

-- Existing orgs have already been onboarded; do not mail them a sample alert.
UPDATE public.organizations
   SET demo_alert_sent = true
 WHERE demo_alert_sent = false;

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- 1. Column exists, NOT NULL, defaults false:
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'organizations'
--     AND column_name = 'demo_alert_sent';
--
--   Expect: boolean | NO | false
--
-- 2. No pre-existing org is queued for a showcase email:
--
--   SELECT count(*) FROM public.organizations WHERE demo_alert_sent = false;
--
--   Expect 0 immediately after applying.
--
-- 3. The claim is single-winner. Run twice against one org; the first returns a
--    row, the second returns none:
--
--   UPDATE public.organizations SET demo_alert_sent = true
--    WHERE id = '<org-uuid>' AND demo_alert_sent = false RETURNING id;
