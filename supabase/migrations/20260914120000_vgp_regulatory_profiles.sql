-- 20260914120000_vgp_regulatory_profiles.sql
--
-- Replace vgp_equipment_types with a regulatory profile catalogue.
--
-- ---------------------------------------------------------------------------
-- WHY THE CATEGORY JOIN IS GONE
-- ---------------------------------------------------------------------------
-- The old table was reached by matching its `name` against an asset's category
-- string. That could never have been correct, for two independent reasons.
--
-- First, asset_categories is PER-ORGANISATION. 12 orgs own their own rows and
-- "Nacelle" exists 10 separate times, once per tenant, alongside 15 duplicate
-- groups differing only by accent, case or plural ("Chariot elevateur" vs
-- "Chariot élévateur", "Échafaudage" vs "Échafaudages"). A single global
-- catalogue has no stable per-tenant category to key against.
--
-- Second, and decisively: configuration determines the applicable regime, not
-- equipment identity. A telescopic handler with forks follows the forklift
-- rules, with a basket the PEMP rules, with a jib the lifting-crane rules, and
-- with a bucket the earthmoving rules. INRS states each configuration must be
-- verified under its corresponding regime. No category-derived answer can be
-- right for that machine, so the catalogue is selected by the user instead.
--
-- Hence: NO FK, join or lookup between vgp_regulatory_profiles and
-- asset_categories. asset_categories is untouched by this migration.
--
-- ---------------------------------------------------------------------------
-- WHY SNAPSHOTS
-- ---------------------------------------------------------------------------
-- A schedule records the regulatory basis as it stood when the schedule was
-- created. Statutory periodicities change, and a catalogue correction must
-- never silently rewrite the basis of an inspection that already happened --
-- that would make a compliance record retroactively claim something nobody
-- asserted at the time. The snapshot columns are written at create/edit only;
-- catalogue updates never backfill.
--
-- ---------------------------------------------------------------------------
-- CLASSIFICATION STATUS
-- ---------------------------------------------------------------------------
-- Regulatory periodicities are the default/maximum statutory interval for an
-- identified case, not a promise that no shorter interval could apply: INRS
-- notes operating and environmental conditions may require more frequent
-- verification, and the Labour Inspectorate can impose a shorter one. The UI
-- must therefore propose, never mandate. classification_status drives that:
--
--   automatic              prefill the interval, still editable
--   requires_confirmation  prefill, but the user must confirm before save
--                          (e.g. earthmoving plant: 6 months under the
--                          01/03/2004 lifting rules only when equipped and
--                          used for lifting, otherwise potentially the
--                          12-month regime of the arrêté du 05/03/1993)
--   manual_only            no prefill; interchangeable equipment, where the
--                          fitted attachment picks the regime
--
-- The default is requires_confirmation, so a row seeded without an explicit
-- decision asks a human rather than asserting.
--
-- ---------------------------------------------------------------------------
-- ROW COUNT AT MIGRATION TIME: 0
-- ---------------------------------------------------------------------------
-- vgp_equipment_types is empty in production and no seed has ever existed, so
-- the rename carries no data and `code` can be NOT NULL UNIQUE immediately.
-- The backfill below is retained anyway: it costs nothing on an empty table
-- and keeps this migration correct if it is ever replayed somewhere with rows.
--
-- No inbound foreign key references the table, and no equipment_type_id column
-- exists anywhere in the schema, so the rename breaks no constraint.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Rename and extend the catalogue
-- ---------------------------------------------------------------------------

ALTER TABLE public.vgp_equipment_types RENAME TO vgp_regulatory_profiles;

ALTER TABLE public.vgp_regulatory_profiles
  RENAME CONSTRAINT vgp_equipment_types_pkey TO vgp_regulatory_profiles_pkey;

-- Legacy column: kept nullable so the rename is non-destructive, never written
-- again. The old NOT NULL would block every insert that follows this model.
ALTER TABLE public.vgp_regulatory_profiles
  ALTER COLUMN category DROP NOT NULL;

ALTER TABLE public.vgp_regulatory_profiles
  ADD COLUMN code                  text,
  ADD COLUMN usage_condition       text,
  ADD COLUMN classification_status text NOT NULL DEFAULT 'requires_confirmation',
  ADD COLUMN source_url            text,
  ADD COLUMN source_checked_at     timestamptz,
  ADD COLUMN effective_from        date,
  ADD COLUMN effective_to          date,
  ADD COLUMN active                boolean NOT NULL DEFAULT true;

-- Backfill `code` from a slugified name BEFORE the NOT NULL/UNIQUE land.
-- unaccent is not guaranteed present, so the accent folding is explicit.
UPDATE public.vgp_regulatory_profiles
SET code = regexp_replace(
             trim(both '-' from
               regexp_replace(
                 lower(translate(name,
                   'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
                   'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')),
                 '[^a-z0-9]+', '-', 'g')),
             '-{2,}', '-', 'g')
WHERE code IS NULL;

-- Guard the backfill: a duplicate or empty code must abort rather than have
-- the constraint below fail with a less legible error.
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.vgp_regulatory_profiles
  WHERE code IS NULL OR btrim(code) = '';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'code backfill left % row(s) empty', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
  FROM (SELECT code FROM public.vgp_regulatory_profiles
        GROUP BY code HAVING count(*) > 1) d;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'code backfill produced % duplicate code(s)', v_bad;
  END IF;
END $$;

ALTER TABLE public.vgp_regulatory_profiles
  ALTER COLUMN code SET NOT NULL;

ALTER TABLE public.vgp_regulatory_profiles
  ADD CONSTRAINT vgp_regulatory_profiles_code_key UNIQUE (code);

ALTER TABLE public.vgp_regulatory_profiles
  ADD CONSTRAINT vgp_regulatory_profiles_classification_status_check
  CHECK (classification_status IN
    ('automatic', 'requires_confirmation', 'manual_only'));

-- A closed validity window must not end before it starts.
ALTER TABLE public.vgp_regulatory_profiles
  ADD CONSTRAINT vgp_regulatory_profiles_effective_range_check
  CHECK (effective_to IS NULL OR effective_from IS NULL
         OR effective_to >= effective_from);

-- The selector lists active profiles; this is its access path.
CREATE INDEX IF NOT EXISTS idx_vgp_regulatory_profiles_active
  ON public.vgp_regulatory_profiles (active, name)
  WHERE active = true;

COMMENT ON TABLE public.vgp_regulatory_profiles IS
  'Global catalogue of French VGP regulatory profiles. Selected by the user at '
  'schedule create/edit -- never derived from an asset category, because the '
  'fitted configuration determines the applicable regime. Writes are '
  'service_role only.';

COMMENT ON COLUMN public.vgp_regulatory_profiles.classification_status IS
  'automatic = prefill the interval; requires_confirmation = prefill but force '
  'an explicit confirmation; manual_only = no prefill, the configuration picks '
  'the regime.';

COMMENT ON COLUMN public.vgp_regulatory_profiles.default_interval_months IS
  'Default/maximum statutory interval for the identified case. Conditions may '
  'require more frequent verification, and the Labour Inspectorate may impose '
  'a shorter one -- so this is a proposal, never a guarantee.';

COMMENT ON COLUMN public.vgp_regulatory_profiles.category IS
  'LEGACY from vgp_equipment_types. Nullable, never written again. There is '
  'deliberately no relationship to asset_categories.';

-- ---------------------------------------------------------------------------
-- 2. Schedule snapshot columns -- all nullable, no backfill
-- ---------------------------------------------------------------------------
-- Nullable because every existing schedule predates the catalogue and no
-- regulatory basis can honestly be attributed to it after the fact.

ALTER TABLE public.vgp_schedules
  ADD COLUMN regulatory_profile_id             uuid
    REFERENCES public.vgp_regulatory_profiles(id),
  ADD COLUMN regulatory_interval_months        integer,
  ADD COLUMN regulatory_reference_snapshot     text,
  ADD COLUMN regulatory_profile_name_snapshot  text;

COMMENT ON COLUMN public.vgp_schedules.regulatory_interval_months IS
  'The catalogue interval AS IT STOOD when this schedule was saved. Kept '
  'separate from interval_months, which is what the user actually chose: the '
  'gap between them is the audit-relevant fact.';

COMMENT ON COLUMN public.vgp_schedules.regulatory_reference_snapshot IS
  'Regulatory citation captured at save time. Catalogue updates never backfill '
  'this -- a compliance record must not retroactively claim a basis nobody '
  'asserted when it was created.';

-- ---------------------------------------------------------------------------
-- 3. RLS and grants -- global read for signed-in users, writes service_role
-- ---------------------------------------------------------------------------
-- The old policy was FOR SELECT TO PUBLIC USING (true), which reached anon.
-- The old grant additionally handed anon and authenticated
-- INSERT/UPDATE/DELETE/TRUNCATE -- held back only by the absence of a write
-- policy, which is defence by predicate rather than by permission. Both are
-- closed here.
--
-- REVOKE ... FROM PUBLIC does not undo Supabase's default EXECUTE/privilege
-- grant to anon: PUBLIC and anon are different grantees. See
-- docs/working-agreements.md.

ALTER TABLE public.vgp_regulatory_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view equipment types"
  ON public.vgp_regulatory_profiles;

REVOKE ALL ON TABLE public.vgp_regulatory_profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.vgp_regulatory_profiles FROM anon;
REVOKE ALL ON TABLE public.vgp_regulatory_profiles FROM authenticated;

GRANT SELECT ON TABLE public.vgp_regulatory_profiles TO authenticated;

-- Global catalogue: identical for every tenant, so no organization predicate.
CREATE POLICY "Signed-in users can read the regulatory catalogue"
  ON public.vgp_regulatory_profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT, UPDATE or DELETE policy exists by design. service_role bypasses
-- RLS, so seeding and corrections run through it alone.

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- Reverses the migration. The added catalogue columns are dropped, so any
-- classification data entered after this migration is lost on rollback -- that
-- is inherent to reverting the model, not an oversight. Schedule snapshots are
-- dropped with their columns for the same reason.
--
-- BEGIN;
--
-- ALTER TABLE public.vgp_schedules
--   DROP COLUMN IF EXISTS regulatory_profile_name_snapshot,
--   DROP COLUMN IF EXISTS regulatory_reference_snapshot,
--   DROP COLUMN IF EXISTS regulatory_interval_months,
--   DROP COLUMN IF EXISTS regulatory_profile_id;
--
-- DROP POLICY IF EXISTS "Signed-in users can read the regulatory catalogue"
--   ON public.vgp_regulatory_profiles;
--
-- DROP INDEX IF EXISTS public.idx_vgp_regulatory_profiles_active;
--
-- ALTER TABLE public.vgp_regulatory_profiles
--   DROP CONSTRAINT IF EXISTS vgp_regulatory_profiles_effective_range_check,
--   DROP CONSTRAINT IF EXISTS vgp_regulatory_profiles_classification_status_check,
--   DROP CONSTRAINT IF EXISTS vgp_regulatory_profiles_code_key;
--
-- ALTER TABLE public.vgp_regulatory_profiles
--   DROP COLUMN IF EXISTS active,
--   DROP COLUMN IF EXISTS effective_to,
--   DROP COLUMN IF EXISTS effective_from,
--   DROP COLUMN IF EXISTS source_checked_at,
--   DROP COLUMN IF EXISTS source_url,
--   DROP COLUMN IF EXISTS classification_status,
--   DROP COLUMN IF EXISTS usage_condition,
--   DROP COLUMN IF EXISTS code;
--
-- -- Restoring NOT NULL on the legacy column only succeeds if no row has a
-- -- NULL category. Rows added under the new model will, so this is guarded.
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM public.vgp_regulatory_profiles
--                  WHERE category IS NULL) THEN
--     ALTER TABLE public.vgp_regulatory_profiles
--       ALTER COLUMN category SET NOT NULL;
--   END IF;
-- END $$;
--
-- ALTER TABLE public.vgp_regulatory_profiles
--   RENAME CONSTRAINT vgp_regulatory_profiles_pkey TO vgp_equipment_types_pkey;
--
-- ALTER TABLE public.vgp_regulatory_profiles RENAME TO vgp_equipment_types;
--
-- CREATE POLICY "Anyone can view equipment types" ON public.vgp_equipment_types
--   FOR SELECT TO PUBLIC USING (true);
--
-- COMMIT;
