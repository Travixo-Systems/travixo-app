-- ============================================================================
-- A1: revoke ALL from anon on the eight tenant tables that still grant it
-- ============================================================================
--
-- GRANTS ONLY. No column work, no policy change, no function change.
--
-- WHAT THIS CLOSES
--
--   Eight tenant tables still carry the full table-wide grant to anon:
--
--     GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE,
--           UPDATE ON TABLE public.<t> TO "anon", "authenticated", ...
--
--   Nothing is exploitable through it today: RLS policies gate the rows, and
--   the anon role has no policy that admits a write on any of these tables.
--   That is defence by predicate rather than by permission -- the phrase
--   docs/working-agreements.md already uses for the equivalent hazard on
--   function EXECUTE. One permissive policy added later, on any of these eight,
--   turns a dormant grant into a live anonymous write.
--
--   TRUNCATE is included in that grant. On subscriptions and rentals that is a
--   whole-table delete, reachable the moment any policy admits anon.
--
--   Patch A already did this for users and organizations. This is the same
--   move for the rest, deliberately kept separate so the blast radius of each
--   is reviewable on its own.
--
-- WHY anon HAS NO LEGITIMATE USE ON THESE TABLES
--
--   The only anonymous surface in the product is the public QR scan, and it
--   does not read or write any of these eight directly:
--
--     app/scan/[qr_code]/page.tsx  calls get_asset_by_qr(text), a SECURITY
--         DEFINER function. It reads public.assets as the function OWNER, not
--         as anon, so revoking anon's SELECT on assets does not affect it.
--         Verified: the page has no `.from('assets')` at all.
--
--     app/api/scan/update/route.ts writes assets and scans with the SERVICE
--         client (serviceClient() at :13, used at :70), not the anon key.
--
--   public.scans is deliberately NOT in this migration. It carries the
--   scans_insert_public_qr_log policy, which admits anon INSERT on purpose so
--   an unauthenticated scan can be logged. Revoking anon there would break the
--   one anonymous write the product intends. Its policy being too broad is
--   finding M-6 and is a separate question from this grant sweep.
--
-- WHAT THIS DOES NOT FIX
--
--   `authenticated` keeps the table-wide UPDATE on all eight. That is the
--   column-grant work -- Patch A2 onward -- and it is where the real C-2
--   exposure lives (subscriptions.licensed_capacity and .status decide paid
--   status). A1 narrows only the anonymous surface.
--
--   The update-surface gate will therefore still FAIL after this migration,
--   with a smaller anon count. That is expected and correct.
--
-- Rollback SQL is at the foot of this file.
-- ============================================================================

BEGIN;

REVOKE ALL ON TABLE public.vgp_schedules    FROM anon;
REVOKE ALL ON TABLE public.audits           FROM anon;
REVOKE ALL ON TABLE public.audit_items      FROM anon;
REVOKE ALL ON TABLE public.rentals          FROM anon;
REVOKE ALL ON TABLE public.clients          FROM anon;
REVOKE ALL ON TABLE public.team_invitations FROM anon;
REVOKE ALL ON TABLE public.assets           FROM anon;
REVOKE ALL ON TABLE public.subscriptions    FROM anon;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Restores the grants exactly as production carried them. Nothing else moves.
--
--   BEGIN;
--   GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     ON TABLE public.vgp_schedules    TO anon;
--   GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     ON TABLE public.audits           TO anon;
--   GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     ON TABLE public.audit_items      TO anon;
--   GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     ON TABLE public.rentals          TO anon;
--   GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     ON TABLE public.clients          TO anon;
--   GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     ON TABLE public.team_invitations TO anon;
--   GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     ON TABLE public.assets           TO anon;
--   GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     ON TABLE public.subscriptions    TO anon;
--   COMMIT;
-- ============================================================================
