-- 20260914140000_seed_vgp_regulatory_profiles.sql
--
-- Seed the regulatory profile catalogue. 24 rows.
--
-- ---------------------------------------------------------------------------
-- THE INVARIANT THIS MIGRATION MUST NOT BREAK
-- ---------------------------------------------------------------------------
-- 625 vgp_schedules rows already exist, carrying live 12/6/24-month intervals
-- that somebody chose. This migration touches NONE of them.
--
--   existing schedules:  interval_months       UNCHANGED
--                        regulatory_profile_id NULL
--                        snapshots             NULL
--
-- Attaching a regulatory interpretation after the fact would rewrite what an
-- existing compliance record means -- it would claim a basis nobody asserted
-- when the schedule was created. Classification happens only when a new
-- schedule is created, or when a user explicitly reclassifies an existing one.
--
-- This migration contains no UPDATE against vgp_schedules. The seed is INSERT
-- only, and nothing in the schema can propagate it: there is no trigger and no
-- DEFAULT on the four snapshot columns, and the FK carries no ON DELETE action
-- that would write to them.
--
-- ---------------------------------------------------------------------------
-- WHY default_interval_months LOSES ITS NOT NULL
-- ---------------------------------------------------------------------------
-- Row 24 (interchangeable / variable-reach equipment) must have NO default
-- interval. The same telescopic handler is a forklift with forks, a PEMP with
-- a basket, a crane with a jib and an earthmoving machine with a bucket, and
-- INRS ED 6339 is explicit that each configuration is verified under its own
-- regime. Putting 6 there would assert a periodicity that is wrong whenever
-- the machine is fitted differently.
--
-- NOT NULL is therefore dropped, and replaced by a CHECK that ties nullability
-- to classification_status: only manual_only may omit an interval, and
-- manual_only must omit it. That is strictly stronger than the constraint it
-- replaces -- it prevents a manual_only row from silently carrying a number
-- that the UI would then be tempted to prefill.
--
-- ---------------------------------------------------------------------------
-- LEGAL MODEL
-- ---------------------------------------------------------------------------
--   12 months  general rule, art. 23
--    6 months  art. 20-II / 20-III equipment, and powered equipment that
--              transports persons or elevates a workstation, art. 23(a)
--    3 months  equipment elevating a workstation driven DIRECTLY by human
--              force, art. 23(b)
--   12 months  lifting accessories, art. 24
--
-- classification_status is about how much the UI may presume AFTER the user
-- has deliberately selected a profile. It never authorises inferring a profile
-- from asset_categories:
--
--   automatic              the regime follows from the profile alone
--   requires_confirmation  the regime depends on configuration or use that
--                          only the operator can attest
--   manual_only            the fitted configuration decides; propose nothing
--
-- Sources recorded per row. Checked 2026-09-14.

BEGIN;

-- Only manual_only may have no interval, and it must have none.
ALTER TABLE public.vgp_regulatory_profiles
  ALTER COLUMN default_interval_months DROP NOT NULL;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, and a bare ADD aborts the
-- whole transaction on a re-run -- which would roll back the ON CONFLICT DO
-- UPDATE below and leave a drifted row uncorrected. Dropping first makes the
-- migration re-runnable, matching 20260904100000's DROP FUNCTION IF EXISTS.
ALTER TABLE public.vgp_regulatory_profiles
  DROP CONSTRAINT IF EXISTS vgp_regulatory_profiles_interval_presence_check;

ALTER TABLE public.vgp_regulatory_profiles
  ADD CONSTRAINT vgp_regulatory_profiles_interval_presence_check
  CHECK (
    (classification_status = 'manual_only' AND default_interval_months IS NULL)
    OR
    (classification_status <> 'manual_only' AND default_interval_months IS NOT NULL)
  );

-- Idempotent: re-running updates the regulatory content of a row rather than
-- duplicating it. id is never reused as a key here -- code is the stable
-- identifier, and schedules snapshot the values they used anyway, so a
-- correction here cannot disturb a schedule already written.
INSERT INTO public.vgp_regulatory_profiles
  (code, name, default_interval_months, classification_status,
   regulatory_reference, usage_condition, source_url, source_checked_at)
VALUES
  ('grue-tour-gme',
   'Grue à tour à montage par éléments (GME)',
   12, 'automatic',
   'Arrêté du 1er mars 2004, art. 23 (règle générale)',
   NULL,
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680469/2026-02-10',
   '2026-09-14'),

  ('grue-tour-gma',
   'Grue à tour à montage rapide ou automatisé (GMA)',
   6, 'requires_confirmation',
   'Arrêté du 1er mars 2004, art. 20-II et 23(a)',
   'À confirmer : appareil installé sur stabilisateurs.',
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680466',
   '2026-09-14'),

  ('grue-mobile',
   'Grue mobile automotrice ou sur véhicule porteur',
   6, 'requires_confirmation',
   'Arrêté du 1er mars 2004, art. 20-II et 23(a)',
   'À confirmer : emploi ne nécessitant pas de montage ou de démontage important.',
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680466',
   '2026-09-14'),

  ('grue-auxiliaire-chargement',
   'Grue auxiliaire de chargement sur véhicule',
   6, 'automatic',
   'Arrêté du 1er mars 2004, art. 20-II et 23(a)',
   NULL,
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680466',
   '2026-09-14'),

  ('bras-portique-benne-amovible',
   'Bras ou portique de levage pour benne amovible',
   6, 'automatic',
   'Arrêté du 1er mars 2004, art. 20-II et 23(a)',
   NULL,
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680466',
   '2026-09-14'),

  ('hayon-elevateur',
   'Hayon élévateur',
   6, 'automatic',
   'Arrêté du 1er mars 2004, art. 20-II et 23(a)',
   NULL,
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680466',
   '2026-09-14'),

  -- Art. 20-II places furniture lifts and site material hoists in the same
  -- 6-month regime, so they share one profile. Splitting them later is a
  -- display-name change, not a regulatory one.
  ('monte-meubles-materiaux',
   'Monte-meubles ou monte-matériaux de chantier',
   6, 'automatic',
   'Arrêté du 1er mars 2004, art. 20-II et 23(a)',
   NULL,
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680466',
   '2026-09-14'),

  -- The dangerous one. The 6-month lifting regime applies only when the
  -- machine is actually equipped and used for lifting; outside that
  -- configuration a different periodic-verification regime governs. Only the
  -- operator can attest which applies, so this can never be automatic.
  ('engin-terrassement-levage',
   'Engin de terrassement équipé et utilisé pour le levage',
   6, 'requires_confirmation',
   'Arrêté du 1er mars 2004, art. 20-II et 23(a)',
   'À confirmer : l''engin est équipé et effectivement utilisé pour des opérations de levage.',
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680466',
   '2026-09-14'),

  ('chariot-elevateur',
   'Chariot élévateur',
   6, 'automatic',
   'Arrêté du 1er mars 2004, art. 20-II et 23(a)',
   NULL,
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680466',
   '2026-09-14'),

  ('tracteur-poseur-canalisations',
   'Tracteur poseur de canalisations',
   6, 'automatic',
   'Arrêté du 1er mars 2004, art. 20-II et 23(a)',
   NULL,
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680466',
   '2026-09-14'),

  ('pemp-motorisee',
   'PEMP motorisée',
   6, 'automatic',
   'Arrêté du 1er mars 2004, art. 20-II et 23(a)',
   'Élévation motorisée de personnes ou du poste de travail.',
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680466',
   '2026-09-14'),

  ('pemp-force-humaine',
   'PEMP ou poste de travail mû directement par la force humaine',
   3, 'automatic',
   'Arrêté du 1er mars 2004, art. 23(b)',
   'Élévation du poste de travail obtenue directement par la force humaine.',
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680469/2026-02-10',
   '2026-09-14'),

  ('pont-roulant-portique-fixe',
   'Pont roulant ou portique fixe',
   12, 'automatic',
   'Arrêté du 1er mars 2004, art. 23 (règle générale)',
   NULL,
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680469/2026-02-10',
   '2026-09-14'),

  ('treuil-palan-motorise-fixe',
   'Treuil ou palan motorisé fixe pour charges',
   12, 'automatic',
   'Arrêté du 1er mars 2004, art. 23 (règle générale)',
   NULL,
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680469/2026-02-10',
   '2026-09-14'),

  ('portique-chantier',
   'Portique de chantier',
   12, 'automatic',
   'Arrêté du 1er mars 2004, art. 23 (règle générale)',
   NULL,
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680469/2026-02-10',
   '2026-09-14'),

  ('table-elevatrice-charges',
   'Table élévatrice, charges uniquement',
   12, 'automatic',
   'Arrêté du 1er mars 2004, art. 23 (règle générale)',
   'Aucune élévation de personnes ni de poste de travail.',
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680469/2026-02-10',
   '2026-09-14'),

  ('table-elevatrice-personnes',
   'Table élévatrice motorisée élevant des personnes ou un poste de travail',
   6, 'automatic',
   'Arrêté du 1er mars 2004, art. 23(a)',
   'Élévation motorisée de personnes ou du poste de travail.',
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680469/2026-02-10',
   '2026-09-14'),

  ('plate-forme-suspendue-motorisee',
   'Plate-forme suspendue ou nacelle de façade motorisée',
   6, 'automatic',
   'Arrêté du 1er mars 2004, art. 23(a)',
   'Élévation motorisée du poste de travail.',
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680469/2026-02-10',
   '2026-09-14'),

  ('plate-forme-suspendue-force-humaine',
   'Plate-forme suspendue mue directement par la force humaine',
   3, 'automatic',
   'Arrêté du 1er mars 2004, art. 23(b)',
   'Élévation du poste de travail obtenue directement par la force humaine.',
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680469/2026-02-10',
   '2026-09-14'),

  ('plate-forme-sur-mat',
   'Plate-forme sur mât, accès motorisé de personnes ou d''un poste de travail',
   6, 'automatic',
   'Arrêté du 1er mars 2004, art. 23(a)',
   'Accès motorisé de personnes ou élévation motorisée du poste de travail.',
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680469/2026-02-10',
   '2026-09-14'),

  ('appareil-manuel-changeant-site',
   'Appareil manuel non installé à demeure ou changeant de site',
   6, 'requires_confirmation',
   'Arrêté du 1er mars 2004, art. 20-III et 23(a)',
   'À confirmer : conditions d''installation et changement de site applicables.',
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680466',
   '2026-09-14'),

  ('appareil-manuel-fixe',
   'Appareil manuel fixe de levage de charges, sans changement de site',
   12, 'requires_confirmation',
   'Arrêté du 1er mars 2004, art. 23 (règle générale)',
   'À confirmer : installation à demeure, sans changement de site.',
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000006680469/2026-02-10',
   '2026-09-14'),

  ('accessoire-levage',
   'Accessoire de levage',
   12, 'automatic',
   'Arrêté du 1er mars 2004, art. 24',
   'Élingues, palonniers, pinces, aimants, ventouses, clés de levage.',
   'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000032078725',
   '2026-09-14'),

  -- No default interval, deliberately. INRS ED 6339 shows the same
  -- variable-reach truck being verified under different regimes depending on
  -- whether it carries forks, a personnel basket, a jib or a bucket. Any
  -- number here would be wrong for three of those four configurations.
  ('equipement-interchangeable',
   'Chariot télescopique ou équipement interchangeable, configuration non déterminée',
   NULL, 'manual_only',
   'Régime déterminé par la configuration montée',
   'La configuration montée (fourches, nacelle, flèche, godet) détermine le régime de vérification applicable.',
   'https://www.inrs.fr/media.html?refINRS=ED%206339',
   '2026-09-14')

ON CONFLICT (code) DO UPDATE SET
  name                    = EXCLUDED.name,
  default_interval_months = EXCLUDED.default_interval_months,
  classification_status   = EXCLUDED.classification_status,
  regulatory_reference    = EXCLUDED.regulatory_reference,
  usage_condition         = EXCLUDED.usage_condition,
  source_url              = EXCLUDED.source_url,
  source_checked_at       = EXCLUDED.source_checked_at;

-- Fail loudly rather than leave a half-seeded catalogue.
DO $$
DECLARE
  v_total   integer;
  v_touched integer;
BEGIN
  SELECT count(*) INTO v_total FROM public.vgp_regulatory_profiles;
  IF v_total <> 24 THEN
    RAISE EXCEPTION 'expected 24 profiles, found %', v_total;
  END IF;

  -- The invariant. If this migration ever associates an existing schedule,
  -- it must not commit.
  SELECT count(*) INTO v_touched
  FROM public.vgp_schedules
  WHERE regulatory_profile_id IS NOT NULL;
  IF v_touched <> 0 THEN
    RAISE EXCEPTION
      'seed must not associate existing schedules, but % are associated', v_touched;
  END IF;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN
-- ---------------------------------------------------------------------------
-- Removes only profiles never referenced by a schedule. A profile a schedule
-- points at is left in place: the FK would block the delete, and the row is
-- part of that schedule's recorded basis.
--
-- BEGIN;
--
-- DELETE FROM public.vgp_regulatory_profiles p
-- WHERE p.code IN (
--   'grue-tour-gme','grue-tour-gma','grue-mobile','grue-auxiliaire-chargement',
--   'bras-portique-benne-amovible','hayon-elevateur','monte-meubles-materiaux',
--   'engin-terrassement-levage','chariot-elevateur','tracteur-poseur-canalisations',
--   'pemp-motorisee','pemp-force-humaine','pont-roulant-portique-fixe',
--   'treuil-palan-motorise-fixe','portique-chantier','table-elevatrice-charges',
--   'table-elevatrice-personnes','plate-forme-suspendue-motorisee',
--   'plate-forme-suspendue-force-humaine','plate-forme-sur-mat',
--   'appareil-manuel-changeant-site','appareil-manuel-fixe','accessoire-levage',
--   'equipement-interchangeable')
--   AND NOT EXISTS (SELECT 1 FROM public.vgp_schedules s
--                   WHERE s.regulatory_profile_id = p.id);
--
-- ALTER TABLE public.vgp_regulatory_profiles
--   DROP CONSTRAINT IF EXISTS vgp_regulatory_profiles_interval_presence_check;
--
-- -- Only restorable if no manual_only row remains.
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM public.vgp_regulatory_profiles
--                  WHERE default_interval_months IS NULL) THEN
--     ALTER TABLE public.vgp_regulatory_profiles
--       ALTER COLUMN default_interval_months SET NOT NULL;
--   END IF;
-- END $$;
--
-- COMMIT;
