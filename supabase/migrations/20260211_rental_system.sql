-- ============================================================================
-- RENTAL SYSTEM MIGRATION
-- Adds: rentals table, checkout/return RPC functions, indexes, RLS
-- ============================================================================

-- 1. Rentals Table
CREATE TABLE IF NOT EXISTS rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  asset_id UUID NOT NULL REFERENCES assets(id),

  -- Who
  client_name TEXT NOT NULL,
  client_contact TEXT,
  checked_out_by UUID NOT NULL REFERENCES users(id),
  returned_by UUID REFERENCES users(id),

  -- When
  checkout_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_return_date TIMESTAMPTZ,
  actual_return_date TIMESTAMPTZ,

  -- What condition
  checkout_notes TEXT,
  return_notes TEXT,
  return_condition TEXT,

  -- Status: active, returned, cancelled
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'returned', 'cancelled')),

  -- Link to scan records
  checkout_scan_id UUID REFERENCES scans(id),
  return_scan_id UUID REFERENCES scans(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- return_condition constraint (handles NULL correctly for PostgreSQL)
ALTER TABLE rentals ADD CONSTRAINT rentals_return_condition_check
  CHECK (return_condition IS NULL OR return_condition IN ('good', 'fair', 'damaged'));

-- 2. Indexes
CREATE INDEX idx_rentals_org ON rentals(organization_id);
CREATE INDEX idx_rentals_asset ON rentals(asset_id);
CREATE INDEX idx_rentals_active ON rentals(organization_id, status) WHERE status = 'active';
CREATE INDEX idx_rentals_client ON rentals(organization_id, client_name);
CREATE INDEX idx_rentals_checkout_date ON rentals(checkout_date DESC);

-- 3. RLS
ALTER TABLE rentals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org rentals"
  ON rentals FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own org rentals"
  ON rentals FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update own org rentals"
  ON rentals FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- ============================================================================
-- 4. RPC: checkout_asset (atomic checkout)
-- ============================================================================
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
  p_longitude DOUBLE PRECISION DEFAULT NULL
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

  -- 5. Create rental record
  INSERT INTO rentals (
    organization_id, asset_id, client_name, client_contact,
    checked_out_by, checkout_date, expected_return_date,
    checkout_notes, status, checkout_scan_id
  )
  VALUES (
    p_organization_id, p_asset_id, p_client_name, p_client_contact,
    p_user_id, NOW(), p_expected_return_date,
    p_checkout_notes, 'active', v_scan_id
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

-- ============================================================================
-- 5. RPC: return_asset (atomic return)
-- ============================================================================
CREATE OR REPLACE FUNCTION return_asset(
  p_rental_id UUID,
  p_user_id UUID,
  p_return_condition TEXT DEFAULT NULL,
  p_return_notes TEXT DEFAULT NULL,
  p_location_name TEXT DEFAULT NULL,
  p_latitude DOUBLE PRECISION DEFAULT NULL,
  p_longitude DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rental RECORD;
  v_scan_id UUID;
BEGIN
  -- 1. Lock the rental row
  SELECT r.*, a.id AS a_id, a.organization_id AS a_org_id
  INTO v_rental
  FROM rentals r
  JOIN assets a ON a.id = r.asset_id
  WHERE r.id = p_rental_id AND r.status = 'active'
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'rental_not_found');
  END IF;

  -- 2. Create scan record (type: 'return')
  INSERT INTO scans (asset_id, scanned_at, scanned_by, location_name, latitude, longitude, scan_type, notes)
  VALUES (v_rental.asset_id, NOW(), p_user_id, p_location_name, p_latitude, p_longitude, 'return', p_return_notes)
  RETURNING id INTO v_scan_id;

  -- 3. Update rental record
  UPDATE rentals
  SET status = 'returned',
      actual_return_date = NOW(),
      returned_by = p_user_id,
      return_condition = p_return_condition,
      return_notes = p_return_notes,
      return_scan_id = v_scan_id,
      updated_at = NOW()
  WHERE id = p_rental_id;

  -- 4. Update asset status back to available
  UPDATE assets
  SET status = 'available',
      last_seen_at = NOW(),
      last_seen_by = p_user_id,
      current_location = COALESCE(p_location_name, current_location),
      updated_at = NOW()
  WHERE id = v_rental.asset_id;

  RETURN json_build_object(
    'success', true,
    'scan_id', v_scan_id
  );
END;
$$;

-- ============================================================================
-- 6. Add rental_management feature to subscription plans
-- ============================================================================
UPDATE subscription_plans
SET features = features || '{"rental_management": true}'::jsonb
WHERE slug IN ('professional', 'business', 'enterprise');

UPDATE subscription_plans
SET features = features || '{"rental_management": false}'::jsonb
WHERE slug = 'starter';
