-- ============================================================================
-- ADD created_by COLUMN TO vgp_schedules
-- Tracks who configured the monitoring schedule (distinct from inspector_name
-- which tracks who performs the physical inspection).
-- ============================================================================

ALTER TABLE public.vgp_schedules
  ADD COLUMN IF NOT EXISTS created_by text;

ALTER TABLE public.vgp_schedules
  ADD COLUMN IF NOT EXISTS rapport_url text;

COMMENT ON COLUMN public.vgp_schedules.created_by IS
  'Name of the person who configured this VGP monitoring schedule';

COMMENT ON COLUMN public.vgp_schedules.rapport_url IS
  'URL of the uploaded inspection report/certificate that proves the last inspection date';

COMMENT ON COLUMN public.vgp_schedules.inspector_name IS
  'Name of the inspector who performs the physical VGP inspection';
