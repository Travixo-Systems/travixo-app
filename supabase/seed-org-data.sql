-- ============================================================================
-- TraviXO: Full org data seed (realistic French equipment rental company)
-- ============================================================================
-- USAGE:
--   1. Set your org ID below
--   2. Set your user ID (for checked_out_by, performed_by, created_by)
--   3. Run in Supabase SQL editor or psql
--
-- This script:
--   - DELETES all operational data for the org (keeps users, team, subscription)
--   - INSERTS 20 assets, 5 categories, 6 clients, VGP schedules, inspections,
--     rentals, scans, and 1 retired asset
--
-- Expand to 50+ assets by duplicating the asset pattern below.
-- ============================================================================

-- ╔═══════════════════════════════════════════╗
-- ║  SET THESE TWO VALUES BEFORE RUNNING      ║
-- ╚═══════════════════════════════════════════╝

DO $$
DECLARE
  _org_id   uuid := '06a236a1-4f2f-4706-972c-ac1e05fdaf8d';  -- EuroRent Equip
  _user_id  uuid := (SELECT id FROM users WHERE organization_id = '06a236a1-4f2f-4706-972c-ac1e05fdaf8d' ORDER BY created_at ASC LIMIT 1);  -- first user in org

  -- Category IDs (generated)
  _cat_nacelle    uuid := gen_random_uuid();
  _cat_chariot    uuid := gen_random_uuid();
  _cat_engin      uuid := gen_random_uuid();
  _cat_electrique uuid := gen_random_uuid();
  _cat_divers     uuid := gen_random_uuid();

  -- Asset IDs (we need to reference them in schedules, inspections, rentals)
  _a1  uuid := gen_random_uuid();
  _a2  uuid := gen_random_uuid();
  _a3  uuid := gen_random_uuid();
  _a4  uuid := gen_random_uuid();
  _a5  uuid := gen_random_uuid();
  _a6  uuid := gen_random_uuid();
  _a7  uuid := gen_random_uuid();
  _a8  uuid := gen_random_uuid();
  _a9  uuid := gen_random_uuid();
  _a10 uuid := gen_random_uuid();
  _a11 uuid := gen_random_uuid();
  _a12 uuid := gen_random_uuid();
  _a13 uuid := gen_random_uuid();
  _a14 uuid := gen_random_uuid();
  _a15 uuid := gen_random_uuid();
  _a16 uuid := gen_random_uuid();
  _a17 uuid := gen_random_uuid();
  _a18 uuid := gen_random_uuid();
  _a19 uuid := gen_random_uuid();
  _a20 uuid := gen_random_uuid();

  -- Client IDs
  _cl1 uuid := gen_random_uuid();
  _cl2 uuid := gen_random_uuid();
  _cl3 uuid := gen_random_uuid();
  _cl4 uuid := gen_random_uuid();
  _cl5 uuid := gen_random_uuid();
  _cl6 uuid := gen_random_uuid();

  -- Schedule IDs
  _s1  uuid := gen_random_uuid();
  _s2  uuid := gen_random_uuid();
  _s3  uuid := gen_random_uuid();
  _s4  uuid := gen_random_uuid();
  _s5  uuid := gen_random_uuid();
  _s6  uuid := gen_random_uuid();
  _s7  uuid := gen_random_uuid();
  _s8  uuid := gen_random_uuid();
  _s9  uuid := gen_random_uuid();
  _s10 uuid := gen_random_uuid();
  _s11 uuid := gen_random_uuid();
  _s12 uuid := gen_random_uuid();

  -- Rental IDs
  _r1 uuid := gen_random_uuid();
  _r2 uuid := gen_random_uuid();
  _r3 uuid := gen_random_uuid();
  _r4 uuid := gen_random_uuid();
  _r5 uuid := gen_random_uuid();

BEGIN

-- ============================================================================
-- PART 1: CLEAN ALL OPERATIONAL DATA (keep users, team, subscription)
-- ============================================================================

DELETE FROM client_recall_alerts WHERE organization_id = _org_id;
DELETE FROM vgp_alerts            WHERE organization_id = _org_id;
DELETE FROM vgp_inspections       WHERE organization_id = _org_id;
DELETE FROM vgp_schedules         WHERE organization_id = _org_id;
DELETE FROM audit_items            WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = _org_id);
DELETE FROM audits                WHERE organization_id = _org_id;
DELETE FROM scans                 WHERE asset_id IN (SELECT id FROM assets WHERE organization_id = _org_id);
DELETE FROM rentals               WHERE organization_id = _org_id;
DELETE FROM clients               WHERE organization_id = _org_id;
DELETE FROM assets                WHERE organization_id = _org_id;
DELETE FROM asset_categories      WHERE organization_id = _org_id;

-- Mark org as seeded
UPDATE organizations
   SET demo_data_seeded = true, onboarding_completed = true
 WHERE id = _org_id;

-- ============================================================================
-- SCHEMA CLEANUP: Drop stale columns per DESIGN_SPEC.md
-- ============================================================================
-- ── asset_categories ──
-- color: DESIGN_SPEC §3 "DO NOT use colored category badges" — never rendered
ALTER TABLE asset_categories DROP COLUMN IF EXISTS color;

-- ── assets ──
-- assigned_to, custom_fields, last_known_lat/lng: defined but never used in any query or UI
ALTER TABLE assets DROP COLUMN IF EXISTS assigned_to;
ALTER TABLE assets DROP COLUMN IF EXISTS custom_fields;
ALTER TABLE assets DROP COLUMN IF EXISTS last_known_lat;
ALTER TABLE assets DROP COLUMN IF EXISTS last_known_lng;

-- ── scans ──
-- photo_url, ip_address, user_agent: defined but never selected or inserted
ALTER TABLE scans DROP COLUMN IF EXISTS photo_url;
ALTER TABLE scans DROP COLUMN IF EXISTS ip_address;
ALTER TABLE scans DROP COLUMN IF EXISTS user_agent;

-- ============================================================================
-- PART 2: CATEGORIES
-- ============================================================================

INSERT INTO asset_categories (id, organization_id, name) VALUES
  (_cat_nacelle,    _org_id, 'Nacelle'),
  (_cat_chariot,    _org_id, 'Chariot élévateur'),
  (_cat_engin,      _org_id, 'Engin de chantier'),
  (_cat_electrique, _org_id, 'Groupe électrogène'),
  (_cat_divers,     _org_id, 'Matériel divers');

-- ============================================================================
-- PART 3: ASSETS (20 realistic French BTP equipment)
-- ============================================================================
-- Status mix: 12 available, 4 in_use, 2 maintenance, 1 retired (archived), 1 available
-- Locations: Dépôt Gennevilliers, Dépôt Rungis, Chantier Défense, Chantier Saclay

INSERT INTO assets (id, organization_id, name, serial_number, qr_code, qr_url, status, current_location, category_id, purchase_date, purchase_price, current_value, description) VALUES
  -- Nacelles (6)
  (_a1,  _org_id, 'Nacelle articulée Haulotte HA16RTJ',     'NAC-2022-0001', 'qr-' || substr(_a1::text,1,8),  '/scan/qr-' || substr(_a1::text,1,8),  'available',   'Dépôt Gennevilliers', _cat_nacelle, '2022-03-15', 45000, 38000, 'Hauteur travail 16m, diesel, 4x4'),
  (_a2,  _org_id, 'Nacelle ciseaux Skyjack SJ6832RT',       'NAC-2021-0042', 'qr-' || substr(_a2::text,1,8),  '/scan/qr-' || substr(_a2::text,1,8),  'in_use',      'Chantier Défense',    _cat_nacelle, '2021-06-20', 32000, 24000, 'Hauteur travail 11.75m, diesel'),
  (_a3,  _org_id, 'Nacelle télescopique JLG 660SJ',         'NAC-2023-0015', 'qr-' || substr(_a3::text,1,8),  '/scan/qr-' || substr(_a3::text,1,8),  'available',   'Dépôt Gennevilliers', _cat_nacelle, '2023-01-10', 95000, 82000, 'Hauteur travail 22m, diesel, chenilles'),
  (_a4,  _org_id, 'Nacelle articulée Genie Z-45/25J',       'NAC-2022-0067', 'qr-' || substr(_a4::text,1,8),  '/scan/qr-' || substr(_a4::text,1,8),  'available',   'Dépôt Rungis',        _cat_nacelle, '2022-09-01', 52000, 44000, 'Hauteur travail 15.87m, diesel'),
  (_a5,  _org_id, 'Nacelle ciseaux électrique Haulotte Compact 12', 'NAC-2024-0003', 'qr-' || substr(_a5::text,1,8), '/scan/qr-' || substr(_a5::text,1,8), 'in_use', 'Chantier Saclay', _cat_nacelle, '2024-02-15', 28000, 26000, 'Hauteur travail 12m, électrique, intérieur'),
  (_a6,  _org_id, 'Nacelle sur camion Klubb KL32',          'NAC-2020-0089', 'qr-' || substr(_a6::text,1,8),  '/scan/qr-' || substr(_a6::text,1,8),  'maintenance', 'Dépôt Gennevilliers', _cat_nacelle, '2020-11-05', 68000, 42000, 'Hauteur travail 32m, montée sur MAN TGS'),

  -- Chariots (5)
  (_a7,  _org_id, 'Chariot élévateur Toyota 8FD25',          'CHA-2021-0103', 'qr-' || substr(_a7::text,1,8),  '/scan/qr-' || substr(_a7::text,1,8),  'available',   'Dépôt Gennevilliers', _cat_chariot, '2021-04-12', 28000, 21000, 'Capacité 2.5T, diesel, mât triplex 4.7m'),
  (_a8,  _org_id, 'Chariot télescopique Manitou MT1440',     'CHA-2023-0067', 'qr-' || substr(_a8::text,1,8),  '/scan/qr-' || substr(_a8::text,1,8),  'in_use',      'Chantier Défense',    _cat_chariot, '2023-05-20', 72000, 62000, 'Capacité 4T, hauteur 14m, stabilisateurs'),
  (_a9,  _org_id, 'Chariot élévateur Linde H30D',            'CHA-2022-0028', 'qr-' || substr(_a9::text,1,8),  '/scan/qr-' || substr(_a9::text,1,8),  'available',   'Dépôt Rungis',        _cat_chariot, '2022-08-30', 34000, 27000, 'Capacité 3T, diesel, cabine fermée'),
  (_a10, _org_id, 'Chariot élévateur électrique Jungheinrich EFG 220', 'CHA-2024-0011', 'qr-' || substr(_a10::text,1,8), '/scan/qr-' || substr(_a10::text,1,8), 'available', 'Dépôt Rungis', _cat_chariot, '2024-01-08', 38000, 36000, 'Capacité 2T, électrique, usage intérieur'),
  (_a11, _org_id, 'Chariot télescopique rotatif Merlo Roto 40.25', 'CHA-2022-0055', 'qr-' || substr(_a11::text,1,8), '/scan/qr-' || substr(_a11::text,1,8), 'available', 'Dépôt Gennevilliers', _cat_chariot, '2022-12-01', 85000, 68000, 'Capacité 4T, portée 25m, rotatif 360°'),

  -- Engins de chantier (5)
  (_a12, _org_id, 'Mini-pelle Kubota KX080-4',               'ENG-2023-0009', 'qr-' || substr(_a12::text,1,8), '/scan/qr-' || substr(_a12::text,1,8), 'available',   'Dépôt Gennevilliers', _cat_engin, '2023-03-22', 62000, 54000, 'Poids 8T, profondeur fouille 4.5m'),
  (_a13, _org_id, 'Chargeuse compacte Bobcat S650',          'ENG-2022-0055', 'qr-' || substr(_a13::text,1,8), '/scan/qr-' || substr(_a13::text,1,8), 'in_use',      'Chantier Saclay',     _cat_engin, '2022-07-14', 45000, 35000, 'Capacité 1.2T, chenilles, godet 0.9m³'),
  (_a14, _org_id, 'Plaque vibrante Bomag BPR 35/60',         'ENG-2023-0071', 'qr-' || substr(_a14::text,1,8), '/scan/qr-' || substr(_a14::text,1,8), 'available',   'Dépôt Rungis',        _cat_engin, '2023-09-05', 4500,  3800,  'Compactage sol, 60cm, moteur Honda'),
  (_a15, _org_id, 'Pelle sur chenilles Volvo EC220E',        'ENG-2021-0033', 'qr-' || substr(_a15::text,1,8), '/scan/qr-' || substr(_a15::text,1,8), 'available',   'Dépôt Gennevilliers', _cat_engin, '2021-11-20', 145000, 98000, 'Poids 22T, godet 1.2m³, GPS embarqué'),
  (_a16, _org_id, 'Dumper Wacker Neuson DW60',               'ENG-2024-0022', 'qr-' || substr(_a16::text,1,8), '/scan/qr-' || substr(_a16::text,1,8), 'available',   'Dépôt Rungis',        _cat_engin, '2024-04-10', 52000, 49000, 'Capacité 6T, 4x4, benne rotative'),

  -- Groupes électrogènes (2)
  (_a17, _org_id, 'Groupe électrogène SDMO J110',            'GE-2023-0015',  'qr-' || substr(_a17::text,1,8), '/scan/qr-' || substr(_a17::text,1,8), 'available',   'Dépôt Gennevilliers', _cat_electrique, '2023-06-01', 18000, 15000, '110 kVA, diesel, insonorisé'),
  (_a18, _org_id, 'Groupe électrogène Atlas Copco QAS 150',  'GE-2022-0008',  'qr-' || substr(_a18::text,1,8), '/scan/qr-' || substr(_a18::text,1,8), 'maintenance', 'Dépôt Rungis',        _cat_electrique, '2022-02-28', 32000, 24000, '150 kVA, diesel, remorquable'),

  -- Matériel divers (2)
  (_a19, _org_id, 'Compresseur Atlas Copco XAS 97',          'COMP-2022-0028','qr-' || substr(_a19::text,1,8), '/scan/qr-' || substr(_a19::text,1,8), 'available',   'Dépôt Gennevilliers', _cat_divers, '2022-05-15', 12000, 9000, 'Débit 5.3m³/min, diesel, remorquable'),
  (_a20, _org_id, 'Échafaudage roulant Layher UNI-L 12m',   'DIV-2021-0033', 'qr-' || substr(_a20::text,1,8), '/scan/qr-' || substr(_a20::text,1,8), 'available',   'Dépôt Rungis',        _cat_divers, '2021-08-10', 8500,  5500,  'Hauteur plancher 12m, aluminium, kit complet');

-- Retire one asset (soft delete example)
UPDATE assets SET
  status = 'retired',
  archived_at = '2025-11-15T10:00:00Z',
  archived_by = _user_id,
  archive_reason = 'vendu'
WHERE id = _a6;

-- ============================================================================
-- PART 4: CLIENTS (6 realistic French companies)
-- ============================================================================

INSERT INTO clients (id, organization_id, name, email, phone, company, notes) VALUES
  (_cl1, _org_id, 'Martin Lefebvre',   'martin.lefebvre@bouygues-construction.com', '06 12 34 56 78', 'Bouygues Construction',  'Chantier Tour Triangle, La Défense'),
  (_cl2, _org_id, 'Sophie Durand',     'sophie.durand@vinci-construction.fr',       '06 98 76 54 32', 'Vinci Construction',     'Responsable matériel, zone Saclay'),
  (_cl3, _org_id, 'Pierre Moreau',     'p.moreau@eiffage-genie-civil.com',          '07 11 22 33 44', 'Eiffage Génie Civil',    'Grand Paris Express - Lot T3'),
  (_cl4, _org_id, 'Claire Bernard',    'claire.bernard@spie-batignolles.fr',        '06 55 66 77 88', 'Spie Batignolles',       'Contact fiable, règlement 30j'),
  (_cl5, _org_id, 'Jean-Marc Petit',   'jm.petit@colas-idf.fr',                    '06 44 33 22 11', 'Colas Île-de-France',    'Travaux voirie, enrobés'),
  (_cl6, _org_id, 'Nathalie Roux',     'n.roux@razel-bec.com',                     '07 99 88 77 66', 'Razel-Bec',              'Fondations spéciales');

-- ============================================================================
-- PART 5: VGP SCHEDULES (12 — mix of overdue, upcoming, compliant)
-- ============================================================================
-- Relative to CURRENT_DATE so the seed stays realistic whenever you run it.

INSERT INTO vgp_schedules (id, asset_id, organization_id, interval_months, last_inspection_date, next_due_date, status, created_by, inspection_location) VALUES
  -- OVERDUE (3) — past due dates
  (_s1,  _a1,  _org_id, 12, (CURRENT_DATE - interval '14 months')::date, (CURRENT_DATE - interval '2 months')::date,  'active', 'Bureau Veritas', 'depot'),
  (_s2,  _a7,  _org_id, 12, (CURRENT_DATE - interval '13 months')::date, (CURRENT_DATE - interval '1 month')::date,   'active', 'APAVE',          'depot'),
  (_s3,  _a12, _org_id, 6,  (CURRENT_DATE - interval '8 months')::date,  (CURRENT_DATE - interval '15 days')::date,   'active', 'SOCOTEC',        'depot'),

  -- UPCOMING ≤30 days (3)
  (_s4,  _a2,  _org_id, 6,  (CURRENT_DATE - interval '5 months')::date,  (CURRENT_DATE + interval '12 days')::date,  'active', 'Bureau Veritas', 'client_site'),
  (_s5,  _a8,  _org_id, 12, (CURRENT_DATE - interval '11 months')::date, (CURRENT_DATE + interval '25 days')::date,  'active', 'DEKRA',          'depot'),
  (_s6,  _a13, _org_id, 12, (CURRENT_DATE - interval '11 months')::date, (CURRENT_DATE + interval '8 days')::date,   'active', 'APAVE',          'client_site'),

  -- COMPLIANT (6) — due in >30 days
  (_s7,  _a3,  _org_id, 12, (CURRENT_DATE - interval '4 months')::date,  (CURRENT_DATE + interval '8 months')::date,  'active', 'Bureau Veritas', 'depot'),
  (_s8,  _a4,  _org_id, 12, (CURRENT_DATE - interval '6 months')::date,  (CURRENT_DATE + interval '6 months')::date,  'active', 'SOCOTEC',        'depot'),
  (_s9,  _a9,  _org_id, 12, (CURRENT_DATE - interval '3 months')::date,  (CURRENT_DATE + interval '9 months')::date,  'active', 'DEKRA',          'depot'),
  (_s10, _a15, _org_id, 12, (CURRENT_DATE - interval '2 months')::date,  (CURRENT_DATE + interval '10 months')::date, 'active', 'APAVE',          'depot'),
  (_s11, _a17, _org_id, 12, (CURRENT_DATE - interval '5 months')::date,  (CURRENT_DATE + interval '7 months')::date,  'active', 'Bureau Veritas', 'depot'),
  (_s12, _a11, _org_id, 6,  (CURRENT_DATE - interval '2 months')::date,  (CURRENT_DATE + interval '4 months')::date,  'active', 'SOCOTEC',        'depot');

-- ============================================================================
-- PART 6: VGP INSPECTIONS (past inspection history — 8 records)
-- ============================================================================

INSERT INTO vgp_inspections (
  organization_id, asset_id, schedule_id, inspection_date,
  inspector_name, inspector_company, verification_type, observations,
  result, certification_number, next_inspection_date, performed_by
) VALUES
  -- Asset 1: last inspection 14 months ago (now overdue)
  (_org_id, _a1, _s1, (CURRENT_DATE - interval '14 months')::date,
   'Jean Dupont', 'Bureau Veritas', 'PERIODIQUE', 'RAS - Équipement conforme',
   'passed', 'VGP-2025-00142', (CURRENT_DATE - interval '2 months')::date, _user_id),

  -- Asset 3: inspection 4 months ago (compliant)
  (_org_id, _a3, _s7, (CURRENT_DATE - interval '4 months')::date,
   'Jean Dupont', 'Bureau Veritas', 'PERIODIQUE', 'Légère usure câble de levage, à surveiller',
   'passed', 'VGP-2025-00287', (CURRENT_DATE + interval '8 months')::date, _user_id),

  -- Asset 4: inspection 6 months ago
  (_org_id, _a4, _s8, (CURRENT_DATE - interval '6 months')::date,
   'Marie Martin', 'SOCOTEC', 'PERIODIQUE', 'RAS',
   'passed', 'VGP-2025-00198', (CURRENT_DATE + interval '6 months')::date, _user_id),

  -- Asset 7: overdue, last inspected 13 months ago
  (_org_id, _a7, _s2, (CURRENT_DATE - interval '13 months')::date,
   'Pierre Dubois', 'APAVE', 'PERIODIQUE', 'Fourches conformes, chaînes OK',
   'passed', 'VGP-2025-00064', (CURRENT_DATE - interval '1 month')::date, _user_id),

  -- Asset 9: inspected 3 months ago
  (_org_id, _a9, _s9, (CURRENT_DATE - interval '3 months')::date,
   'Sophie Laurent', 'DEKRA', 'PERIODIQUE', 'RAS - Conforme',
   'passed', 'VGP-2026-00033', (CURRENT_DATE + interval '9 months')::date, _user_id),

  -- Asset 12: overdue, last inspected 8 months ago — conditional result
  (_org_id, _a12, _s3, (CURRENT_DATE - interval '8 months')::date,
   'Pierre Dubois', 'SOCOTEC', 'PERIODIQUE', 'Fuite circuit hydraulique vérin de flèche - réparation requise sous 30j',
   'conditional', 'VGP-2025-00311', (CURRENT_DATE - interval '15 days')::date, _user_id),

  -- Asset 15: inspected 2 months ago
  (_org_id, _a15, _s10, (CURRENT_DATE - interval '2 months')::date,
   'Marie Martin', 'APAVE', 'PERIODIQUE', 'Godet neuf installé, chenilles 70% usure',
   'passed', 'VGP-2026-00058', (CURRENT_DATE + interval '10 months')::date, _user_id),

  -- Asset 17: inspected 5 months ago
  (_org_id, _a17, _s11, (CURRENT_DATE - interval '5 months')::date,
   'Jean Dupont', 'Bureau Veritas', 'PERIODIQUE', 'Niveau sonore conforme, pas de fuite carburant',
   'passed', 'VGP-2025-00401', (CURRENT_DATE + interval '7 months')::date, _user_id);

-- ============================================================================
-- PART 7: RENTALS (5 — 3 active, 2 returned)
-- ============================================================================

INSERT INTO rentals (id, organization_id, asset_id, client_name, client_id, checked_out_by, checkout_date, expected_return_date, status, checkout_notes) VALUES
  -- Active rentals (assets marked in_use above)
  (_r1, _org_id, _a2,  'Martin Lefebvre',  _cl1, _user_id, (CURRENT_DATE - interval '12 days')::date, (CURRENT_DATE + interval '18 days')::date, 'active', 'Chantier Tour Triangle, niveau 14-18'),
  (_r2, _org_id, _a8,  'Pierre Moreau',    _cl3, _user_id, (CURRENT_DATE - interval '5 days')::date,  (CURRENT_DATE + interval '25 days')::date, 'active', 'Grand Paris Express gare Villejuif'),
  (_r3, _org_id, _a5,  'Sophie Durand',    _cl2, _user_id, (CURRENT_DATE - interval '3 days')::date,  (CURRENT_DATE + interval '11 days')::date, 'active', 'Bâtiment recherche campus Saclay'),

  -- Also mark _a13 as active rental
  (_r4, _org_id, _a13, 'Sophie Durand',    _cl2, _user_id, (CURRENT_DATE - interval '20 days')::date, (CURRENT_DATE + interval '10 days')::date, 'active', 'Terrassement parking Saclay');

-- Returned rental (historical)
INSERT INTO rentals (id, organization_id, asset_id, client_name, client_id, checked_out_by, returned_by, checkout_date, expected_return_date, actual_return_date, status, checkout_notes, return_notes, return_condition) VALUES
  (_r5, _org_id, _a15, 'Jean-Marc Petit', _cl5, _user_id, _user_id,
   (CURRENT_DATE - interval '45 days')::date,
   (CURRENT_DATE - interval '15 days')::date,
   (CURRENT_DATE - interval '17 days')::date,
   'returned', 'Travaux canalisation RD7', 'Retour anticipé 2j, bon état', 'good');

-- ============================================================================
-- PART 8: SCANS (recent activity for dashboard "Scans 7j" metric)
-- ============================================================================

INSERT INTO scans (asset_id, scanned_at, location_name, scanned_by, scan_type) VALUES
  (_a1,  NOW() - interval '1 day',  'Dépôt Gennevilliers', _user_id, 'inventory'),
  (_a2,  NOW() - interval '2 days', 'Chantier Défense',    _user_id, 'checkout'),
  (_a7,  NOW() - interval '3 days', 'Dépôt Gennevilliers', _user_id, 'inventory'),
  (_a5,  NOW() - interval '3 days', 'Chantier Saclay',     _user_id, 'checkout'),
  (_a8,  NOW() - interval '4 days', 'Chantier Défense',    _user_id, 'checkout'),
  (_a12, NOW() - interval '5 days', 'Dépôt Gennevilliers', _user_id, 'inventory'),
  (_a13, NOW() - interval '5 days', 'Chantier Saclay',     _user_id, 'checkout'),
  (_a15, NOW() - interval '6 days', 'Dépôt Gennevilliers', _user_id, 'return'),
  (_a3,  NOW() - interval '6 days', 'Dépôt Gennevilliers', _user_id, 'inventory'),
  (_a17, NOW() - interval '7 days', 'Dépôt Gennevilliers', _user_id, 'inventory');

-- ============================================================================
-- DONE
-- ============================================================================

RAISE NOTICE '✓ Seed complete for org %', _org_id;
RAISE NOTICE '  Categories: 5';
RAISE NOTICE '  Assets: 20 (1 retired/archived)';
RAISE NOTICE '  Clients: 6';
RAISE NOTICE '  VGP Schedules: 12 (3 overdue, 3 upcoming, 6 compliant)';
RAISE NOTICE '  VGP Inspections: 8';
RAISE NOTICE '  Rentals: 5 (4 active, 1 returned)';
RAISE NOTICE '  Scans: 10 (last 7 days)';

END $$;
