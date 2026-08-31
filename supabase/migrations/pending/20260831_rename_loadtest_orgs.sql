-- 20260831_rename_loadtest_orgs.sql   -- PENDING: NOT APPLIED, awaiting approval
--
-- Rename the two load-test tenants so they cannot be mistaken for customers.
--
-- ---------------------------------------------------------------------------
-- WHY
-- ---------------------------------------------------------------------------
-- "ProMachinery France" and "TechLift Solutions" read as real French plant
-- hire companies. They are not: they are seeded load-test fixtures holding
-- 1,000 assets each, which is about 70% of every asset row in the database.
--
-- That matters in two directions:
--
--   1. Someone tidying up production could delete them, taking most of the
--      dataset with them. They must be kept.
--   2. Someone reading an admin org list, or a revenue report, could count
--      them as real tenants.
--
-- The ZZ- prefix sorts them to the bottom of any alphabetical list and states
-- what they are in the name itself.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS TOUCHES
-- ---------------------------------------------------------------------------
-- organizations.name only. Not the slug: the slug appears in seeded user email
-- addresses (user0@promachinery-france.test) and changing it would leave those
-- addresses referring to a slug that no longer exists. Not the ids, which are
-- referenced by 2,000 asset rows and by load/lib/config.js.
--
-- Names appear in emails sent to that org's own recipients. Since both orgs'
-- users are unroutable .test addresses, no real person receives mail showing
-- the new name.

BEGIN;

UPDATE public.organizations
SET name = 'ZZ-LOADTEST-1',
    updated_at = NOW()
WHERE id = 'e9248833-65db-43ad-b0cb-c76d58fd9abb';  -- was: ProMachinery France

UPDATE public.organizations
SET name = 'ZZ-LOADTEST-2',
    updated_at = NOW()
WHERE id = 'b35d5605-6cbb-4977-8d11-fa312a90bc38';  -- was: TechLift Solutions

COMMIT;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   SELECT id, name, slug, subscription_tier,
--          (SELECT COUNT(*) FROM public.assets a
--            WHERE a.organization_id = o.id AND a.archived_at IS NULL) AS assets
--   FROM public.organizations o
--   WHERE o.id IN ('e9248833-65db-43ad-b0cb-c76d58fd9abb',
--                  'b35d5605-6cbb-4977-8d11-fa312a90bc38');
--
-- Expect ZZ-LOADTEST-1 and ZZ-LOADTEST-2, slugs unchanged, 1000 assets each.
--
-- ---------------------------------------------------------------------------
-- DO NOT DELETE THESE ORGANIZATIONS
-- ---------------------------------------------------------------------------
-- They are kept on purpose. Their volume is what lets the k6 harness measure
-- realistic payloads, and their existence is the evidence that the asset cap
-- was never enforced before 20260831_enforce_pilot_asset_limit.sql.
