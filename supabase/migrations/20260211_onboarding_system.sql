-- ============================================================
-- TraviXO Onboarding System Migration
-- Date: 2026-02-11
-- Purpose: Add onboarding tracking columns for self-service
--          registration flow (demo data seeding, onboarding state)
-- ============================================================

-- 1. Onboarding tracking on organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_data_seeded BOOLEAN DEFAULT false;

-- 2. Demo data flag on assets (allows cleanup / visual distinction)
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS is_demo_data BOOLEAN DEFAULT false;
