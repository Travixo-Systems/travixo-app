-- ============================================================
-- DIAGNOSTIC ONLY -- read-only, changes nothing.
-- Run in the Supabase SQL Editor and paste the result back.
--
-- RLS is now ON for assets and scans, but anon can still read every
-- row. Permissive policies are OR'd together, so a single pre-existing
-- policy that grants `anon` (or `public`) re-opens the whole table.
-- assets reports 12 policies and scans 6 -- far more than this
-- migration created, so there are older policies still in force.
--
-- This lists every policy on both tables, with the roles it applies to
-- and its USING / WITH CHECK expressions, so we can see which one is
-- letting anon through.
-- ============================================================

SELECT
  tablename,
  policyname,
  permissive,                    -- PERMISSIVE policies are OR'd
  cmd,                           -- SELECT / INSERT / UPDATE / DELETE / ALL
  roles::text     AS applies_to, -- look for {anon} or {public}
  qual            AS using_expr,
  with_check      AS check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('assets', 'scans')
ORDER BY tablename, cmd, policyname;
