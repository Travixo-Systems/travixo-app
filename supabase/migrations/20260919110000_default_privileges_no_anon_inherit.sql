-- ============================================================================
-- Default privileges: stop new objects inheriting table-wide grants
-- ============================================================================
--
-- THIS IS THE ROOT CAUSE, and without it every grant patch is cleanup that
-- regenerates on the next CREATE TABLE.
--
-- WHAT IS WRONG NOW
--
--   supabase/schemas/public/default_privileges.sql records:
--
--     ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--       GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE,
--             UPDATE ON TABLES TO anon;
--     ... the same for authenticated and service_role
--
--     ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--       REVOKE ALL ON FUNCTIONS FROM PUBLIC;
--     ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--       GRANT EXECUTE ON FUNCTIONS TO anon;
--     ... the same for authenticated and service_role
--
--   So every table created in public from now on is born with the full DML
--   surface -- including TRUNCATE and DELETE -- granted to anon and to
--   authenticated, and every function is born EXECUTE-able by anon. That is
--   how all 21 tables reached their current state, and it is why A1 and the
--   column-grant patches would otherwise be an endless sweep: the next
--   migration that adds a table undoes them for that table.
--
--   docs/working-agreements.md already documents the function half of this and
--   the reason REVOKE does not help:
--
--     "Supabase default privileges grant EXECUTE on every new function in
--      public to anon automatically, and REVOKE ... FROM PUBLIC does not undo
--      it: PUBLIC and anon are different grantees."
--
--   The same is true of tables, and the table default was never written down.
--
-- WHAT THIS CHANGES
--
--   New TABLES: anon gets nothing; authenticated gets SELECT, INSERT, UPDATE,
--   DELETE but NOT TRUNCATE, TRIGGER, REFERENCES or MAINTAIN. Those four are
--   schema-level powers no client session needs, and TRUNCATE in particular is
--   a whole-table delete that bypasses RLS row filtering.
--
--   New FUNCTIONS: anon gets nothing. A function that is genuinely public --
--   get_asset_by_qr is the only one today -- states that with an explicit
--   GRANT in its own migration, which is a decision a reviewer can see rather
--   than a default nobody chose.
--
--   service_role is unchanged. It is the server's identity and is expected to
--   hold the full surface.
--
-- WHAT THIS DOES NOT CHANGE
--
--   Nothing that already exists. ALTER DEFAULT PRIVILEGES applies only to
--   objects created AFTER it runs. Every current table and function keeps
--   exactly the grants it has; A1 and the column-grant patches are still
--   required to clean those up. This migration only stops the problem
--   recurring.
--
--   `authenticated` keeping UPDATE at the table level for new tables is
--   deliberate. Narrowing it to a column allowlist cannot be expressed as a
--   default -- columns are not known until the table exists -- so that stays a
--   per-table decision, now made against a smaller starting surface.
--
-- FOR ROLE postgres
--
--   The existing defaults are recorded FOR ROLE postgres, which is the role
--   Supabase migrations run as and therefore the creator of new objects.
--   Matching that exactly is what makes these override rather than sit
--   alongside the current entries.
--
-- Rollback SQL is at the foot of this file.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- TABLES
-- --------------------------------------------------------------------------

-- anon: nothing on new tables. A table meant to be anonymously readable says
-- so with its own explicit GRANT.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;

-- authenticated: the four verbs a client session legitimately uses. TRUNCATE,
-- TRIGGER, REFERENCES and MAINTAIN are removed -- TRUNCATE because it is a
-- whole-table delete that RLS row filtering does not constrain, the other
-- three because they are schema powers, not data access.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- --------------------------------------------------------------------------
-- FUNCTIONS
-- --------------------------------------------------------------------------

-- anon: nothing on new functions. This is the default that put EXECUTE on ten
-- functions including the four super-admin ones, where only an internal
-- is_super_admin() check stood between anon and an admin RPC.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- --------------------------------------------------------------------------
-- SEQUENCES
-- --------------------------------------------------------------------------

-- anon has no reason to advance a sequence. authenticated keeps USAGE/SELECT
-- because a client INSERT on a table with a serial column needs it; UPDATE on
-- a sequence is setval() and is not something a session should do.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE UPDATE ON SEQUENCES FROM authenticated;

COMMIT;

-- ============================================================================
-- VERIFY (read-only, run after applying)
-- ============================================================================
--   SELECT defaclobjtype,
--          pg_get_userbyid(defaclrole) AS for_role,
--          defaclacl
--     FROM pg_default_acl d
--     JOIN pg_namespace n ON n.oid = d.defaclnamespace
--    WHERE n.nspname = 'public';
--
-- Expect no `anon=` entry for r (tables), f (functions) or S (sequences), and
-- authenticated on tables showing arwd only -- no D (TRUNCATE), x, t or m.
--
-- Then create a throwaway table and confirm it is born clean:
--   CREATE TABLE public._defacl_probe(id int);
--   SELECT relacl FROM pg_class WHERE relname = '_defacl_probe';
--   DROP TABLE public._defacl_probe;
-- ============================================================================

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Restores the defaults exactly as supabase/schemas/public/default_privileges.sql
-- records them. NOTE: rolling back means the next table created is again born
-- with TRUNCATE and DELETE granted to anon.
--
--   BEGIN;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     ON TABLES TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     ON TABLES TO authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO authenticated;
--   COMMIT;
-- ============================================================================
