-- TraviXO Subscription System Schema - FIXED RLS
-- Run this in Supabase SQL Editor

-- 1. Subscription Plans Table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_yearly DECIMAL(10,2),
  max_assets INTEGER NOT NULL,
  max_users INTEGER NOT NULL,
  features JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Subscriptions Table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id)
);

-- 3. Add subscription fields to organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS is_pilot BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pilot_start_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pilot_end_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';

-- 4. Usage Tracking Table
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  asset_count INTEGER DEFAULT 0,
  user_count INTEGER DEFAULT 0,
  scan_count INTEGER DEFAULT 0,
  inspection_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, period_start)
);

-- 5. Insert Default Plans
INSERT INTO subscription_plans (name, slug, description, price_monthly, price_yearly, max_assets, max_users, features, display_order) VALUES
(
  'Starter',
  'starter',
  'Perfect for small teams getting started',
  250.00,
  2700.00,
  100,
  5,
  '{
    "qr_generation": true,
    "public_scanning": true,
    "basic_reports": true,
    "csv_export": true,
    "email_support": true,
    "vgp_compliance": false,
    "digital_audits": false,
    "api_access": false,
    "custom_branding": false,
    "priority_support": false
  }'::jsonb,
  1
),
(
  'Professional',
  'professional',
  'For growing companies with compliance needs',
  750.00,
  8100.00,
  500,
  15,
  '{
    "qr_generation": true,
    "public_scanning": true,
    "basic_reports": true,
    "csv_export": true,
    "email_support": true,
    "vgp_compliance": true,
    "digital_audits": true,
    "api_access": false,
    "custom_branding": false,
    "priority_support": true
  }'::jsonb,
  2
),
(
  'Business',
  'business',
  'For mid-size operations',
  2500.00,
  27000.00,
  2000,
  50,
  '{
    "qr_generation": true,
    "public_scanning": true,
    "basic_reports": true,
    "csv_export": true,
    "email_support": true,
    "vgp_compliance": true,
    "digital_audits": true,
    "api_access": true,
    "custom_branding": false,
    "priority_support": true,
    "dedicated_support": true
  }'::jsonb,
  3
),
(
  'Enterprise',
  'enterprise',
  'For large fleets',
  5000.00,
  54000.00,
  999999,
  100,
  '{
    "qr_generation": true,
    "public_scanning": true,
    "basic_reports": true,
    "csv_export": true,
    "email_support": true,
    "vgp_compliance": true,
    "digital_audits": true,
    "api_access": true,
    "custom_branding": true,
    "priority_support": true,
    "dedicated_support": true,
    "custom_integrations": true
  }'::jsonb,
  4
)
ON CONFLICT (slug) DO NOTHING;

-- 6. Create indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions(current_period_end);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_org ON usage_tracking(organization_id);

-- 7. Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies - FIXED SYNTAX

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view subscription plans" ON subscription_plans;
DROP POLICY IF EXISTS "Users can view own organization subscription" ON subscriptions;
DROP POLICY IF EXISTS "Users can view own organization usage" ON usage_tracking;

-- Subscription Plans: Public read
CREATE POLICY "Anyone can view subscription plans"
  ON subscription_plans FOR SELECT
  USING (is_active = true);

-- Subscriptions: Users can only see their organization's subscription
-- Uses custom users table lookup (matches application pattern)
CREATE POLICY "Users can view own organization subscription"
  ON subscriptions FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM users 
      WHERE id = auth.uid()
    )
  );

-- Usage Tracking: Users can only see their organization's usage
CREATE POLICY "Users can view own organization usage"
  ON usage_tracking FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM users 
      WHERE id = auth.uid()
    )
  );

-- 9. Function to check if organization has feature access
CREATE OR REPLACE FUNCTION has_feature_access(
  org_id UUID,
  feature_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  org_is_pilot BOOLEAN;
  org_pilot_active BOOLEAN;
  org_subscription_active BOOLEAN;
  feature_enabled BOOLEAN;
BEGIN
  -- Check if organization is an active pilot.
  -- If pilot_start_date or pilot_end_date is NULL the pilot period is unbounded
  -- on that side (e.g. no end date = indefinite pilot).
  SELECT
    is_pilot,
    (is_pilot
      AND (pilot_start_date IS NULL OR NOW() >= pilot_start_date)
      AND (pilot_end_date   IS NULL OR NOW() <= pilot_end_date))
  INTO org_is_pilot, org_pilot_active
  FROM organizations
  WHERE id = org_id;

  -- Pilots get all features during pilot period
  IF org_pilot_active THEN
    RETURN TRUE;
  END IF;
  
  -- Check if subscription is active and has the feature
  SELECT 
    (s.status = 'active' OR s.status = 'trialing'),
    (sp.features->feature_name)::boolean
  INTO org_subscription_active, feature_enabled
  FROM subscriptions s
  JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE s.organization_id = org_id;
  
  RETURN COALESCE(org_subscription_active AND feature_enabled, FALSE);
END;
$$;

-- 10. Function to check asset limit
CREATE OR REPLACE FUNCTION check_asset_limit(org_id UUID)
RETURNS TABLE (
  current_count INTEGER,
  max_allowed INTEGER,
  limit_reached BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM assets WHERE organization_id = org_id),
    COALESCE(
      (SELECT sp.max_assets 
       FROM subscriptions s 
       JOIN subscription_plans sp ON s.plan_id = sp.id 
       WHERE s.organization_id = org_id 
       AND s.status IN ('active', 'trialing')
       LIMIT 1),
      100
    )::INTEGER,
    (SELECT COUNT(*) FROM assets WHERE organization_id = org_id) >= 
    COALESCE(
      (SELECT sp.max_assets 
       FROM subscriptions s 
       JOIN subscription_plans sp ON s.plan_id = sp.id 
       WHERE s.organization_id = org_id 
       AND s.status IN ('active', 'trialing')
       LIMIT 1),
      100
    );
END;
$$;

-- 11. Create default trial subscriptions for existing organizations
INSERT INTO subscriptions (organization_id, plan_id, status, current_period_start, current_period_end, trial_start, trial_end)
SELECT 
  o.id,
  (SELECT id FROM subscription_plans WHERE slug = 'professional' LIMIT 1),
  'trialing',
  NOW(),
  NOW() + INTERVAL '14 days',
  NOW(),
  NOW() + INTERVAL '14 days'
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions WHERE organization_id = o.id
)
ON CONFLICT (organization_id) DO NOTHING;

-- 12. Trigger for usage tracking
CREATE OR REPLACE FUNCTION track_asset_creation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO usage_tracking (
    organization_id,
    period_start,
    period_end,
    asset_count
  )
  SELECT 
    COALESCE(NEW.organization_id, OLD.organization_id),
    date_trunc('month', NOW()),
    date_trunc('month', NOW()) + INTERVAL '1 month',
    COUNT(*)
  FROM assets
  WHERE organization_id = COALESCE(NEW.organization_id, OLD.organization_id)
  GROUP BY organization_id
  ON CONFLICT (organization_id, period_start) 
  DO UPDATE SET 
    asset_count = EXCLUDED.asset_count,
    created_at = NOW();
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS track_asset_creation_trigger ON assets;
CREATE TRIGGER track_asset_creation_trigger
  AFTER INSERT OR DELETE ON assets
  FOR EACH ROW
  EXECUTE FUNCTION track_asset_creation();