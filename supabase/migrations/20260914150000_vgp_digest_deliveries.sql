-- 20260914150000_vgp_digest_deliveries.sql
--
-- Record that a weekly digest was actually delivered.
--
-- ---------------------------------------------------------------------------
-- THE AMBIGUITY THIS REMOVES
-- ---------------------------------------------------------------------------
-- pending_weekly_digests is an outbox: the cron deletes its rows once Resend
-- acknowledges the send. Nothing else is written. So an empty queue is
-- consistent with BOTH "every digest was delivered" and "no digest has ever
-- been sent" -- and the orphan-cleanup path deletes rows too, for a user who
-- no longer has an email.
--
-- That made the feature unverifiable from the database. docs/FEATURES-ACTUAL.md
-- recorded the queue as "drained = normal", which was an assumption, not an
-- observation: there was no artifact anywhere that could tell a working send
-- from one that had never happened.
--
-- This table is that artifact. One row per delivered digest, holding the
-- Resend message id that sendVGPWeeklyDigest already returns and the route
-- previously discarded.
--
-- ---------------------------------------------------------------------------
-- WHY IT IS NOT A COLUMN ON pending_weekly_digests
-- ---------------------------------------------------------------------------
-- Those rows are deleted on success. A sent_at column there would be written
-- and immediately destroyed. The delivery record has to outlive the queue
-- entry, so it is a separate table with no FK back to the queue.
--
-- It deliberately does NOT reference vgp_schedules either. A schedule can be
-- archived or its asset deleted long after a digest went out, and the fact
-- that mail was delivered on a date must survive that. item_count records how
-- many queued items the email covered; the identities are not kept, because
-- this is a delivery log, not a second copy of the alert history.

BEGIN;

CREATE TABLE IF NOT EXISTS public.vgp_digest_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nullable and ON DELETE SET NULL: deleting a user must not erase the
  -- evidence that mail was sent to them. recipient_email keeps the address as
  -- it was at send time for the same reason.
  user_id         uuid REFERENCES public.users(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,

  recipient_email text        NOT NULL,
  period          text        NOT NULL DEFAULT 'weekly',
  item_count      integer     NOT NULL,

  -- Resend's message id. Nullable because a provider can acknowledge a send
  -- without returning one; a delivery with no id is still a delivery, and
  -- recording it as NULL is more honest than refusing to log it.
  provider_message_id text,

  sent_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT vgp_digest_deliveries_period_check
    CHECK (period IN ('weekly', 'daily')),
  CONSTRAINT vgp_digest_deliveries_item_count_check
    CHECK (item_count > 0)
);

CREATE INDEX IF NOT EXISTS idx_vgp_digest_deliveries_sent_at
  ON public.vgp_digest_deliveries (sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_vgp_digest_deliveries_user
  ON public.vgp_digest_deliveries (user_id, sent_at DESC);

COMMENT ON TABLE public.vgp_digest_deliveries IS
  'One row per digest email Resend acknowledged. Exists because the outbox '
  'deletes its rows on success, which made an empty queue indistinguishable '
  'from a feature that had never worked.';

COMMENT ON COLUMN public.vgp_digest_deliveries.provider_message_id IS
  'Resend message id, as returned by the send. The traceable artifact: it can '
  'be looked up in the provider dashboard to confirm actual delivery.';

ALTER TABLE public.vgp_digest_deliveries ENABLE ROW LEVEL SECURITY;

-- Read-only to users, and only their own rows. Unlike
-- pending_weekly_digests -- which carries a blanket write grant to
-- authenticated, held back only by the absence of a write policy -- this table
-- is never written by a browser session. Only the cron writes it, through
-- service_role, which bypasses RLS.
REVOKE ALL ON TABLE public.vgp_digest_deliveries FROM PUBLIC;
REVOKE ALL ON TABLE public.vgp_digest_deliveries FROM anon;
REVOKE ALL ON TABLE public.vgp_digest_deliveries FROM authenticated;

GRANT SELECT ON TABLE public.vgp_digest_deliveries TO authenticated;

-- CREATE POLICY has no IF NOT EXISTS, so a bare CREATE aborts the whole
-- transaction on a re-run -- while the CREATE TABLE / CREATE INDEX above
-- would have skipped harmlessly. Dropping first keeps the migration
-- re-runnable, matching the DOWN block below and 20260914140000's
-- DROP CONSTRAINT IF EXISTS.
DROP POLICY IF EXISTS "vgp_digest_deliveries_select_own"
  ON public.vgp_digest_deliveries;

CREATE POLICY "vgp_digest_deliveries_select_own"
  ON public.vgp_digest_deliveries
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- Dropping this table destroys delivery evidence that cannot be reconstructed:
-- the queue rows it corresponds to were deleted at send time. Export before
-- running it.
--
-- BEGIN;
-- DROP POLICY IF EXISTS "vgp_digest_deliveries_select_own"
--   ON public.vgp_digest_deliveries;
-- DROP INDEX IF EXISTS public.idx_vgp_digest_deliveries_user;
-- DROP INDEX IF EXISTS public.idx_vgp_digest_deliveries_sent_at;
-- DROP TABLE IF EXISTS public.vgp_digest_deliveries;
-- COMMIT;
