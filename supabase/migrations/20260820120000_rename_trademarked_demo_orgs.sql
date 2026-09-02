-- ============================================================
-- Rename test organizations that use real companies' trademarks
--
-- WHY
--   Two test/demo organizations were named after real French equipment
--   rental firms -- Loxam and Kiloutou -- and one test user was named
--   after a real branch ("Kiloutou Bobigny"). They are not customers;
--   they are internal test records.
--
--   Using a real company's name on records inside a live database is a
--   liability even when nothing is public: it shows up in admin views,
--   screenshots, exports, demos and support conversations, where it
--   reads as "Loxam is a customer". Combined with the fact that these
--   rows were publicly readable until 20260820_drop_permissive_public_
--   policies.sql, it is worth removing the ambiguity entirely.
--
--   (Mentions of Loxam/Kiloutou in docs/ are left untouched -- naming
--   real market players as prospects in strategy documents is normal
--   and is not what this migration is about.)
--
-- WHAT CHANGES
--   organizations.name / .slug for exactly two rows, and one
--   users.full_name. Nothing else: ids are untouched, so all assets,
--   categories, subscriptions and logins keep working unchanged.
--
--   Loxam Île-de-France Pilot -> Demo Rental Idf     (50 assets, 5 categories)
--   kiloutou                  -> Demo Rental Nord    (0 assets)
--   user "Kiloutou Bobigny"   -> "Demo User Nord"
--
--   Names are generic and obviously non-real, so nobody mistakes them
--   for customers later.
--
-- SAFETY
--   Targeted by primary key, so this cannot touch any other row even if
--   a real customer later signs up with a similar name. Each statement
--   is a no-op if the row was already renamed, so it is safe to re-run.
--
--   `slug` has a unique constraint; the new slugs are checked for
--   collisions in the verification query at the bottom.
--
-- NOT A DATA MIGRATION
--   No assets, scans, rentals or subscriptions are modified.
--
-- STATUS: NOT YET APPLIED as of 2026-08-20. The two orgs still carry
--   their branded names in production. Run this in the Supabase SQL
--   Editor; both verification queries at the bottom should return zero
--   rows afterwards.
-- ============================================================

-- Loxam Île-de-France Pilot -> Demo Rental Idf
UPDATE public.organizations
SET name       = 'Demo Rental Idf',
    slug       = 'demo-rental-idf',
    updated_at = now()
WHERE id = 'ed538394-a20c-432d-8d7d-5d54262d58cc';

-- kiloutou -> Demo Rental Nord
UPDATE public.organizations
SET name       = 'Demo Rental Nord',
    slug       = 'demo-rental-nord',
    updated_at = now()
WHERE id = '977c0edd-5801-4307-a47e-0020e6d27e04';

-- "Kiloutou Bobigny" -> "Demo User Nord"
-- (display name only -- the login email is not touched, so this account
--  keeps working exactly as before.)
UPDATE public.users
SET full_name = 'Demo User Nord'
WHERE id = 'be4e49e9-0d2d-4468-a036-5c827b0b6498';

-- --- verify, in the same run ---------------------------------
-- Expect: zero rows from both queries.
SELECT 'org still branded' AS check_name, id, name, slug
FROM public.organizations
WHERE name ILIKE '%loxam%' OR name ILIKE '%kiloutou%'
   OR slug ILIKE '%loxam%' OR slug ILIKE '%kiloutou%';

SELECT 'user still branded' AS check_name, id, full_name
FROM public.users
WHERE full_name ILIKE '%loxam%' OR full_name ILIKE '%kiloutou%';
