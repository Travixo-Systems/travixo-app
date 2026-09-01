CREATE OR REPLACE FUNCTION public.checkout_asset (
  p_asset_id             uuid,
  p_organization_id      uuid,
  p_user_id              uuid,
  p_client_name          text,
  p_client_contact       text                     DEFAULT NULL::text,
  p_expected_return_date timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_checkout_notes       text                     DEFAULT NULL::text,
  p_location_name        text                     DEFAULT NULL::text,
  p_latitude             double precision         DEFAULT NULL::double precision,
  p_longitude            double precision         DEFAULT NULL::double precision
)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.checkout_asset (
  p_asset_id             uuid,
  p_organization_id      uuid,
  p_user_id              uuid,
  p_client_name          text,
  p_client_contact       text                     DEFAULT NULL::text,
  p_expected_return_date timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_checkout_notes       text                     DEFAULT NULL::text,
  p_location_name        text                     DEFAULT NULL::text,
  p_latitude             double precision         DEFAULT NULL::double precision,
  p_longitude            double precision         DEFAULT NULL::double precision,
  p_client_id            uuid                     DEFAULT NULL::uuid
)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
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
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."checkout_asset"(uuid, uuid, uuid, text, text, timestamp WITH time zone, text, text, double precision, double precision)
  TO "authenticated", "postgres", "service_role";

GRANT EXECUTE
  ON FUNCTION "public"."checkout_asset"(uuid, uuid, uuid, text, text, timestamp WITH time zone, text, text, double precision, double precision, uuid)
  TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."checkout_asset"(uuid, uuid, uuid, text, text, timestamp WITH time zone, text, text, double precision, double precision) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."checkout_asset"(uuid, uuid, uuid, text, text, timestamp WITH time zone, text, text, double precision, double precision, uuid) FROM PUBLIC;
