-- ============================================================
-- Restore French accents in seeded asset / category / location text
--
-- WHY
--   Demo and seed data was written without accents ("Chariot elevateur",
--   "Depot Principal", "Chantier Batiment C"). On a product sold to French
--   rental firms this is the first thing a buyer notices, and these rows
--   are what appear in screenshots and demos.
--
--   Counts found on 2026-08-20:
--     assets.name              elevateur 7, telescopique 9, electrogene 8
--     asset_categories.name    elevateur 6
--     assets.current_location  Depot 46, Batiment 2, Entrepot 3
--
-- SCOPE
--   Text-only. No ids, relationships, prices or dates are touched.
--   Uses replace() on specific substrings rather than a blanket rewrite,
--   so a name that is already correct is left exactly as it is (running
--   this twice changes nothing the second time).
--
-- NOTE ON CATEGORIES
--   asset_categories.name is corrected here too. The importer added in
--   this same change matches category names accent-insensitively, so a
--   spreadsheet saying "Chariot elevateur" will still map onto the
--   corrected "Chariot élévateur" rather than creating a duplicate.
-- ============================================================

-- --- assets.name ---------------------------------------------
UPDATE public.assets
SET name = replace(replace(replace(name,
      'elevateur',    'élévateur'),
      'telescopique', 'télescopique'),
      'electrogene',  'électrogène')
WHERE name LIKE '%elevateur%'
   OR name LIKE '%telescopique%'
   OR name LIKE '%electrogene%';

-- Capitalised variants at the start of a name.
UPDATE public.assets
SET name = replace(replace(replace(name,
      'Elevateur',    'Élévateur'),
      'Telescopique', 'Télescopique'),
      'Electrogene',  'Électrogène')
WHERE name LIKE '%Elevateur%'
   OR name LIKE '%Telescopique%'
   OR name LIKE '%Electrogene%';

-- --- asset_categories.name -----------------------------------
UPDATE public.asset_categories
SET name = replace(replace(replace(name,
      'elevateur',    'élévateur'),
      'telescopique', 'télescopique'),
      'electrogene',  'électrogène')
WHERE name LIKE '%elevateur%'
   OR name LIKE '%telescopique%'
   OR name LIKE '%electrogene%';

UPDATE public.asset_categories
SET name = replace(replace(replace(name,
      'Elevateur',    'Élévateur'),
      'Telescopique', 'Télescopique'),
      'Electrogene',  'Électrogène')
WHERE name LIKE '%Elevateur%'
   OR name LIKE '%Telescopique%'
   OR name LIKE '%Electrogene%';

-- --- assets.current_location ---------------------------------
UPDATE public.assets
SET current_location = replace(replace(replace(current_location,
      'Depot',    'Dépôt'),
      'Batiment', 'Bâtiment'),
      'Entrepot', 'Entrepôt')
WHERE current_location LIKE '%Depot%'
   OR current_location LIKE '%Batiment%'
   OR current_location LIKE '%Entrepot%';

UPDATE public.assets
SET current_location = replace(replace(replace(current_location,
      'depot',    'dépôt'),
      'batiment', 'bâtiment'),
      'entrepot', 'entrepôt')
WHERE current_location LIKE '%depot%'
   OR current_location LIKE '%batiment%'
   OR current_location LIKE '%entrepot%';

-- --- verify, in the same run ---------------------------------
-- Expect zero rows.
SELECT 'assets.name' AS field, count(*) AS remaining
FROM public.assets
WHERE name ILIKE '%elevateur%' OR name ILIKE '%telescopique%' OR name ILIKE '%electrogene%'
UNION ALL
SELECT 'asset_categories.name', count(*)
FROM public.asset_categories
WHERE name ILIKE '%elevateur%' OR name ILIKE '%telescopique%' OR name ILIKE '%electrogene%'
UNION ALL
SELECT 'assets.current_location', count(*)
FROM public.assets
WHERE current_location ILIKE '%depot%' OR current_location ILIKE '%batiment%'
   OR current_location ILIKE '%entrepot%';
