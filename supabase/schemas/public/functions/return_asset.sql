CREATE OR REPLACE FUNCTION public.return_asset (
  p_rental_id        uuid,
  p_user_id          uuid,
  p_return_condition text             DEFAULT NULL::text,
  p_return_notes     text             DEFAULT NULL::text,
  p_location_name    text             DEFAULT NULL::text,
  p_latitude         double precision DEFAULT NULL::double precision,
  p_longitude        double precision DEFAULT NULL::double precision
)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
DECLARE
  v_rental RECORD;
  v_scan_id UUID;
  -- Derived, never accepted as an argument. NULL for an unauthenticated or
  -- org-less caller, which then matches no rental.
  v_org    UUID := public.get_my_organization_id();
  v_actor  UUID := auth.uid();
BEGIN
  -- B0: refuse callers with no organisation outright, so the query below
  -- cannot be reached with v_org NULL and accidentally match a NULL org row.
  IF v_org IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'rental_not_found');
  END IF;

  -- 1. Lock the rental row.
  --    B0: the asset must belong to the CALLER'S organisation. Same error as a
  --    genuinely missing rental, so the response does not disclose whether a
  --    rental id exists in another tenant.
  SELECT r.*, a.id AS a_id, a.organization_id AS a_org_id
  INTO v_rental
  FROM rentals r
  JOIN assets a ON a.id = r.asset_id
  WHERE r.id = p_rental_id
    AND r.status = 'active'
    AND a.organization_id = v_org
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'rental_not_found');
  END IF;

  -- 2. Create scan record (type: 'return').
  --    B0: attribution comes from auth.uid(), not from p_user_id.
  INSERT INTO scans (asset_id, scanned_at, scanned_by, location_name, latitude, longitude, scan_type, notes)
  VALUES (v_rental.asset_id, NOW(), v_actor, p_location_name, p_latitude, p_longitude, 'return', p_return_notes)
  RETURNING id INTO v_scan_id;

  -- 3. Update rental record
  UPDATE rentals
  SET status = 'returned',
      actual_return_date = NOW(),
      returned_by = v_actor,
      return_condition = p_return_condition,
      return_notes = p_return_notes,
      return_scan_id = v_scan_id,
      updated_at = NOW()
  WHERE id = p_rental_id;

  -- 4. Update asset status back to available
  UPDATE assets
  SET status = 'available',
      last_seen_at = NOW(),
      last_seen_by = v_actor,
      current_location = COALESCE(p_location_name, current_location),
      updated_at = NOW()
  WHERE id = v_rental.asset_id;

  RETURN json_build_object(
    'success', true,
    'scan_id', v_scan_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."return_asset"(uuid, uuid, text, text, text, double precision, double precision) TO "authenticated", "postgres", "service_role";

COMMENT ON FUNCTION "public"."return_asset"(uuid, uuid, text, text, text, double precision, double precision) IS 'B0 (C-3 fix). Returns an active rental. The organisation is derived from auth.uid() via get_my_organization_id() and the asset must belong to it; a rental in another tenant reports rental_not_found. p_user_id is accepted for signature compatibility but ignored -- attribution uses auth.uid().';

REVOKE ALL ON FUNCTION "public"."return_asset"(uuid, uuid, text, text, text, double precision, double precision) FROM PUBLIC;
