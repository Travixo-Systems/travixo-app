-- 20260901_drop_stale_checkout_overload.sql
--
-- Remove the stale 10-argument checkout_asset overload.
--
-- ---------------------------------------------------------------------------
-- CONFIRMED LIVE, NOT INFERRED
-- ---------------------------------------------------------------------------
-- Probed against production on 2026-09-01. Calling checkout_asset with the ten
-- original arguments returns PGRST203:
--
--   Could not choose the best candidate function between:
--     public.checkout_asset(p_asset_id => uuid, ..., p_longitude => double precision)
--     public.checkout_asset(p_asset_id => uuid, ..., p_longitude => double precision,
--                           p_client_id => uuid)
--
-- Both definitions are therefore live. 20260211_client_recall_system.sql:105
-- used CREATE OR REPLACE to "update" the function, but adding a parameter
-- changes the signature, and CREATE OR REPLACE only replaces an identical
-- signature. It created a second function and left the first one callable.
--
-- ---------------------------------------------------------------------------
-- WHY IT MATTERS
-- ---------------------------------------------------------------------------
-- The 10-arg version predates client linkage: `client_id` appears nowhere in
-- its body (20260211_rental_system.sql:81+). A checkout resolved to it writes
-- a rental with client_id NULL, silently. Nothing errors. The rental simply
-- never links to a client, so the client recall pass -- the one that tells
-- customers to bring equipment back before its VGP deadline -- cannot find
-- them.
--
-- Today that is latent rather than active: the only caller,
-- app/api/rentals/checkout/route.ts:52, always passes p_client_id, so it
-- always resolves to the 11-arg version. The risk is a future caller, or a
-- manual RPC call, omitting that one argument and getting the old behaviour
-- with no indication anything is wrong.
--
-- ---------------------------------------------------------------------------
-- CALLER AUDIT (required before dropping)
-- ---------------------------------------------------------------------------
-- Searched app/, lib/, components/, scripts/, load/ and supabase/ for
-- `checkout_asset`:
--
--   app/api/rentals/checkout/route.ts:52   the ONLY application caller.
--                                          Passes all 11 arguments including
--                                          p_client_id -> uses the 11-arg
--                                          version. Unaffected by this drop.
--   supabase/migrations/20260211_rental_system.sql:81
--                                          defines the 10-arg version (the one
--                                          being dropped)
--   supabase/migrations/20260211_client_recall_system.sql:105
--                                          defines the 11-arg version (kept)
--   supabase/migrations/20260827_advisor_hardening.sql:135
--                                          references the NAME in a search_path
--                                          hardening loop, not a signature.
--                                          Unaffected.
--
-- No caller invokes the 10-argument form. Dropping it removes an unreachable
-- code path, not a working one.
--
-- ---------------------------------------------------------------------------
-- SAFETY
-- ---------------------------------------------------------------------------
-- The signature is written out in full so this can only ever drop the intended
-- overload. If the 10-arg version has already been removed, IF EXISTS makes
-- this a no-op rather than an error.
--
-- The 11-arg version is deliberately NOT touched.

BEGIN;

DROP FUNCTION IF EXISTS public.checkout_asset(
  UUID,               -- p_asset_id
  UUID,               -- p_organization_id
  UUID,               -- p_user_id
  TEXT,               -- p_client_name
  TEXT,               -- p_client_contact
  TIMESTAMPTZ,        -- p_expected_return_date
  TEXT,               -- p_checkout_notes
  TEXT,               -- p_location_name
  DOUBLE PRECISION,   -- p_latitude
  DOUBLE PRECISION    -- p_longitude
);

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
-- 1. Exactly ONE checkout_asset should remain, the 11-argument one:
--
--   SELECT pg_get_function_identity_arguments(p.oid) AS args
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'checkout_asset';
--
--   Expect a single row ending in ", p_client_id uuid".
--
-- 2. A checkout still works. Easiest real check is the app itself: scan an
--    available asset and check it out. The rental row must carry a client_id.
--
-- 3. The ambiguity is gone. Calling with the ten old arguments should now fail
--    with "function does not exist" rather than PGRST203 "could not choose the
--    best candidate", which is the point: an omitted client_id becomes a loud
--    error instead of a silently unlinked rental.
