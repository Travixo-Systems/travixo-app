-- ============================================================================
-- VGP SCHEDULES RLS POLICIES
-- Adds missing Row Level Security policies for vgp_schedules table.
-- Without these, the browser Supabase client (anon key) cannot read
-- schedules, causing the assets table VGP column to always show
-- "Non planifié" even when schedules exist.
-- ============================================================================

-- 1. Ensure RLS is enabled (idempotent — no-op if already enabled)
ALTER TABLE public.vgp_schedules ENABLE ROW LEVEL SECURITY;

-- 2. Ensure the FK constraint exists (the table was created via dashboard
--    and may be missing the constraint that PostgREST needs for embeds)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_name = 'vgp_schedules'
      AND constraint_name = 'vgp_schedules_asset_id_fkey'
  ) THEN
    ALTER TABLE public.vgp_schedules
      ADD CONSTRAINT vgp_schedules_asset_id_fkey
      FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_name = 'vgp_schedules'
      AND constraint_name = 'vgp_schedules_organization_id_fkey'
  ) THEN
    ALTER TABLE public.vgp_schedules
      ADD CONSTRAINT vgp_schedules_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 3. SELECT policy — org members can view their org's schedules
DROP POLICY IF EXISTS "Users can view own org vgp_schedules" ON public.vgp_schedules;
CREATE POLICY "Users can view own org vgp_schedules"
  ON public.vgp_schedules FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- 4. INSERT policy — org members can create schedules for their org
DROP POLICY IF EXISTS "Users can insert own org vgp_schedules" ON public.vgp_schedules;
CREATE POLICY "Users can insert own org vgp_schedules"
  ON public.vgp_schedules FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- 5. UPDATE policy — org members can update their org's schedules
DROP POLICY IF EXISTS "Users can update own org vgp_schedules" ON public.vgp_schedules;
CREATE POLICY "Users can update own org vgp_schedules"
  ON public.vgp_schedules FOR UPDATE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- 6. DELETE policy — org members can delete their org's schedules
DROP POLICY IF EXISTS "Users can delete own org vgp_schedules" ON public.vgp_schedules;
CREATE POLICY "Users can delete own org vgp_schedules"
  ON public.vgp_schedules FOR DELETE
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );
