-- ============================================================
-- TraviXO Stripe Billing Integration
-- Date: 2026-02-07
-- Purpose: Add Stripe fields to existing schema + entitlement system
-- EXTENDS existing tables, breaks nothing
-- ============================================================

-- 1. Stripe customer ID on organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

-- 2. Stripe fields on existing subscriptions table
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

-- 3. Stripe price IDs on existing subscription_plans
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_price_monthly TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_annual TEXT;

-- 4. Billing events audit log
CREATE TABLE IF NOT EXISTS public.billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  stripe_invoice_id TEXT,
  amount DECIMAL(10,2),
  currency TEXT DEFAULT 'eur',
  status TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Entitlement overrides (for custom deals, pilots, promos)
CREATE TABLE IF NOT EXISTS public.entitlement_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT true,
  reason TEXT,
  granted_by UUID REFERENCES public.users(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, feature)
);

-- 6. Migrate existing pilots into entitlement_overrides
-- (Pilots become override rows instead of special-case code paths)
INSERT INTO public.entitlement_overrides (organization_id, feature, granted, reason, expires_at)
SELECT o.id, f.feature, true, 'pilot', o.pilot_end_date
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('qr_tracking'), ('public_scanning'), ('basic_reports'), ('csv_export'),
    ('email_support'), ('vgp_compliance'), ('digital_audits'), ('api_access'),
    ('custom_branding'), ('priority_support'), ('dedicated_support'),
    ('custom_integrations')
) AS f(feature)
WHERE o.is_pilot = true
  AND o.pilot_end_date IS NOT NULL
  AND o.pilot_end_date > NOW()
ON CONFLICT (organization_id, feature) DO NOTHING;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_billing_events_org
  ON public.billing_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_stripe_event
  ON public.billing_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_entitlement_overrides_org
  ON public.entitlement_overrides(organization_id);
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer
  ON public.organizations(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON public.subscriptions(stripe_subscription_id);

-- 8. RLS on new tables
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own org billing events" ON public.billing_events;
CREATE POLICY "Users can view own org billing events"
  ON public.billing_events FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view own org entitlements" ON public.entitlement_overrides;
CREATE POLICY "Users can view own org entitlements"
  ON public.entitlement_overrides FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- No client-side INSERT/UPDATE/DELETE on billing_events or entitlement_overrides
-- All writes happen server-side via webhook handler or admin (service role)
