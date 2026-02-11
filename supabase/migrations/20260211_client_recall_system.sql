-- ============================================================================
-- CLIENT RECALL SYSTEM MIGRATION
-- Adds: clients table, client_id FK on rentals, client_recall_alerts table,
--        updated checkout_asset RPC with client_id support
-- ============================================================================

-- 1. Clients Table
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Identity
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  address TEXT,

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique name per org (prevents duplicates)
CREATE UNIQUE INDEX idx_clients_org_name ON clients(organization_id, LOWER(name));

-- Lookup indexes
CREATE INDEX idx_clients_org ON clients(organization_id);
CREATE INDEX idx_clients_email ON clients(organization_id, email) WHERE email IS NOT NULL;

-- RLS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org clients"
  ON clients FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own org clients"
  ON clients FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update own org clients"
  ON clients FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- 2. Add client_id FK to rentals (nullable for backward compatibility)
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);
CREATE INDEX idx_rentals_client_id ON rentals(client_id) WHERE client_id IS NOT NULL;

-- 3. Client Recall Alerts (deduplication table)
CREATE TABLE IF NOT EXISTS client_recall_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  rental_id UUID NOT NULL REFERENCES rentals(id),
  client_id UUID REFERENCES clients(id),
  asset_id UUID NOT NULL REFERENCES assets(id),

  -- Alert info
  alert_type TEXT NOT NULL CHECK (alert_type IN ('recall_30day', 'recall_14day')),
  vgp_schedule_id UUID REFERENCES vgp_schedules(id),
  next_due_date DATE NOT NULL,

  -- Tracking
  sent BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  email_sent_to TEXT[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dedup: one alert per rental+alert_type+due_date combo
CREATE UNIQUE INDEX idx_recall_alerts_dedup
  ON client_recall_alerts(rental_id, alert_type, next_due_date);

CREATE INDEX idx_recall_alerts_org ON client_recall_alerts(organization_id);
CREATE INDEX idx_recall_alerts_rental ON client_recall_alerts(rental_id);

-- RLS
ALTER TABLE client_recall_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org recall alerts"
  ON client_recall_alerts FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Service role inserts (cron), so no INSERT policy needed for users

-- 4. Update checkout_asset RPC to accept optional client_id
CREATE OR REPLACE FUNCTION checkout_asset(
  p_asset_id UUID,
  p_organization_id UUID,
  p_user_id UUID,
  p_client_name TEXT,
  p_client_contact TEXT DEFAULT NULL,
  p_expected_return_date TIMESTAMPTZ DEFAULT NULL,
  p_checkout_notes TEXT DEFAULT NULL,
  p_location_name TEXT DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL,
  p_client_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_asset RECORD;
  v_active_rental RECORD;
  v_vgp_blocked BOOLEAN := FALSE;
  v_scan_id UUID;
  v_rental_id UUID;
BEGIN
  -- 1. Lock the asset row to prevent race conditions
  SELECT * INTO v_asset
  FROM assets
  WHERE id = p_asset_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'asset_not_found');
  END IF;

  -- 2. Check for active rental (already checked out)
  SELECT id INTO v_active_rental
  FROM rentals
  WHERE asset_id = p_asset_id AND status = 'active'
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'already_rented');
  END IF;

  -- 3. Check VGP compliance (hard block if non-compliant)
  SELECT EXISTS (
    SELECT 1 FROM vgp_schedules
    WHERE asset_id = p_asset_id
      AND organization_id = p_organization_id
      AND archived_at IS NULL
      AND (
        (next_due_date < NOW() AND status != 'completed')
        OR
        EXISTS (
          SELECT 1 FROM vgp_inspections vi
          WHERE vi.asset_id = p_asset_id
            AND vi.result = 'NON_CONFORME'
            AND vi.inspection_date = (
              SELECT MAX(inspection_date) FROM vgp_inspections
              WHERE asset_id = p_asset_id
            )
        )
      )
  ) INTO v_vgp_blocked;

  IF v_vgp_blocked THEN
    RETURN json_build_object('success', false, 'error', 'vgp_blocked');
  END IF;

  -- 4. Create scan record (type: 'checkout')
  INSERT INTO scans (asset_id, scanned_at, scanned_by, location_name, latitude, longitude, scan_type, notes)
  VALUES (p_asset_id, NOW(), p_user_id, p_location_name, p_latitude, p_longitude, 'checkout', p_checkout_notes)
  RETURNING id INTO v_scan_id;

  -- 5. Create rental record (now with optional client_id)
  INSERT INTO rentals (
    organization_id, asset_id, client_name, client_contact,
    checked_out_by, checkout_date, expected_return_date,
    checkout_notes, status, checkout_scan_id, client_id
  )
  VALUES (
    p_organization_id, p_asset_id, p_client_name, p_client_contact,
    p_user_id, NOW(), p_expected_return_date,
    p_checkout_notes, 'active', v_scan_id, p_client_id
  )
  RETURNING id INTO v_rental_id;

  -- 6. Update asset status
  UPDATE assets
  SET status = 'in_use',
      last_seen_at = NOW(),
      last_seen_by = p_user_id,
      updated_at = NOW()
  WHERE id = p_asset_id;

  RETURN json_build_object(
    'success', true,
    'rental_id', v_rental_id,
    'scan_id', v_scan_id
  );
END;
$$;
