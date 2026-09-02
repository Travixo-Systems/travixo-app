-- 20260902150000_welcome_email_sent_flag.sql
--
-- Add organizations.welcome_email_sent, the one-shot guard for the welcome
-- onboarding email.
--
-- ---------------------------------------------------------------------------
-- THE BUG THIS CLOSES
-- ---------------------------------------------------------------------------
-- app/api/internal/post-registration seeds demo data and then sends the welcome
-- email. The seed is guarded twice -- once by the caller and once inside
-- seedDemoData() -- but the email call sat outside that guard and ran
-- unconditionally on every request.
--
-- Two callers reached that route for a single signup:
--
--   app/(auth)/confirm/page.tsx     fire-and-forget, promise dropped
--   app/(dashboard)/dashboard/page.tsx  whenever demo_data_seeded is false
--
-- The confirm page drops the fetch promise and navigates immediately, while
-- demo_data_seeded is only written at the END of seedDemoData(). So the user
-- reached the dashboard while the first request was still in flight, read
-- demo_data_seeded = false, and fired a second one. Both then reached the
-- unconditional send: two welcome emails, each carrying the 21KB xlsx
-- attachment.
--
-- Worse, if the seed ever failed, demo_data_seeded stayed false and EVERY
-- subsequent dashboard load re-sent the welcome email indefinitely.
--
-- ---------------------------------------------------------------------------
-- WHY A COLUMN AND NOT A READ-THEN-WRITE CHECK
-- ---------------------------------------------------------------------------
-- Reading the flag and then writing it does not close the race -- that is the
-- same shape as the bug above. Two concurrent callers both read false and both
-- send. The condition has to live inside the UPDATE:
--
--   UPDATE organizations
--      SET welcome_email_sent = true
--    WHERE id = $1 AND welcome_email_sent = false
--   RETURNING id;
--
-- Postgres row-locks for the statement, so exactly one caller gets a row back
-- and the other gets none. The caller in this repo also removes the dashboard
-- trigger entirely, so the race should no longer arise -- but the guard is what
-- makes the property hold regardless of how many callers exist later.
--
-- ---------------------------------------------------------------------------
-- BACKFILL
-- ---------------------------------------------------------------------------
-- Existing organizations are marked TRUE. They have already completed signup
-- and received their welcome email, in several cases more than once. Leaving
-- them at the column default would mail every established account again.

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.welcome_email_sent IS
  'True once the welcome onboarding email has been claimed for this org. '
  'Claimed via a conditional UPDATE before the send, so it is a one-shot guard '
  'rather than a delivery receipt.';

-- Existing orgs have already been welcomed; do not mail them again.
UPDATE public.organizations
   SET welcome_email_sent = true
 WHERE welcome_email_sent = false;

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
--     AND column_name = 'welcome_email_sent';
--
--   Expect: boolean | NO | false
--
-- 2. No existing org is queued for a welcome email:
--
--   SELECT count(*) FROM public.organizations WHERE welcome_email_sent = false;
--
--   Expect 0 immediately after applying.
--
-- 3. The claim is single-winner. Run twice for one org; the first returns a
--    row, the second returns none:
--
--   UPDATE public.organizations SET welcome_email_sent = true
--    WHERE id = '<org-uuid>' AND welcome_email_sent = false RETURNING id;
