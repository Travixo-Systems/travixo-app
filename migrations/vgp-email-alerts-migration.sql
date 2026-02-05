-- =============================================================================
-- VGP Email Alerts - Database Migration
-- Run this in Supabase SQL Editor
-- =============================================================================

-- 1. Create vgp_alerts table for tracking sent email alerts
-- This table prevents duplicate sends and provides audit trail
CREATE TABLE IF NOT EXISTS vgp_alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id uuid NOT NULL REFERENCES vgp_schedules(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('reminder_30day', 'reminder_7day', 'reminder_1day', 'overdue')),
  alert_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  sent boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  email_sent_to text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- 2. Add notification preference columns to organizations table
-- (skip if columns already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'vgp_alerts_enabled'
  ) THEN
    ALTER TABLE organizations ADD COLUMN vgp_alerts_enabled boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'vgp_alert_days'
  ) THEN
    ALTER TABLE organizations ADD COLUMN vgp_alert_days integer[] DEFAULT '{30,7,1,0}';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'notification_preferences'
  ) THEN
    ALTER TABLE organizations ADD COLUMN notification_preferences jsonb DEFAULT '{
      "email_enabled": true,
      "vgp_alerts": {
        "enabled": true,
        "timing": [30, 15, 7, 1],
        "recipients": "owner"
      },
      "digest_mode": "daily",
      "asset_alerts": true,
      "audit_alerts": true
    }'::jsonb;
  END IF;
END $$;

-- 3. Enable Row Level Security on vgp_alerts
ALTER TABLE vgp_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for vgp_alerts
-- Users can only read alerts for their own organization
CREATE POLICY "Users can view own org alerts" ON vgp_alerts
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Only service role can insert (cron job uses service role key)
-- No INSERT policy needed for regular users - the cron job bypasses RLS

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS idx_vgp_alerts_org_date
  ON vgp_alerts (organization_id, alert_date);

CREATE INDEX IF NOT EXISTS idx_vgp_alerts_schedule_type_date
  ON vgp_alerts (schedule_id, alert_type, alert_date);

CREATE INDEX IF NOT EXISTS idx_vgp_alerts_sent_date
  ON vgp_alerts (sent, alert_date);

-- Index on vgp_schedules for the cron query
CREATE INDEX IF NOT EXISTS idx_vgp_schedules_due_date_active
  ON vgp_schedules (next_due_date)
  WHERE archived_at IS NULL AND status = 'active';

-- 5. Backfill existing organizations with default alert settings
UPDATE organizations
SET
  vgp_alerts_enabled = COALESCE(vgp_alerts_enabled, true),
  vgp_alert_days = COALESCE(vgp_alert_days, '{30,7,1,0}')
WHERE vgp_alerts_enabled IS NULL OR vgp_alert_days IS NULL;
