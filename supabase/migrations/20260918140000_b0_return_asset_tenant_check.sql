-- ============================================================================
-- B0: return_asset() tenant check  (C-3)
-- ============================================================================
--
-- WHAT THIS CLOSES
--
--   return_asset() is SECURITY DEFINER and locates the rental by id alone:
--
--     SELECT r.*, a.id AS a_id, a.organization_id AS a_org_id
--     INTO v_rental
--     FROM rentals r JOIN assets a ON a.id = r.asset_id
--     WHERE r.id = p_rental_id AND r.status = 'active'
--     FOR UPDATE OF r;
--
--   It selects a.organization_id into the record AND THEN NEVER READS IT.
--   There is no organization filter and no auth.uid() comparison anywhere in
--   the body. Being SECURITY DEFINER it bypasses the (correct) RLS on rentals.
--
--   Reproduced at runtime 2026-09-16 (V4) against a local reconstruction proven
--   object-for-object identical to the live schema: an Org A member called
--   return_asset with an Org B rental uuid and got {"success": true}. Org B's
--   rental flipped to 'returned' with the Org A caller recorded in returned_by,
--   and Org B's asset flipped to 'available'.
--
--   In a VGP compliance product that is safety-relevant: checkout_asset hard
--   blocks checkout of non-compliant equipment, and this marks a machine
--   "returned and available" in a fleet the caller does not own.
--
-- THE FIX
--
--   Derive the organisation INSIDE the function from auth.uid(), never from an
--   argument, and require the rental's asset to belong to it. This is the
--   pattern record_inspection() already uses and is the model the rest of the
--   RPC surface should follow.
--
--   p_user_id is still accepted (the signature must not change while the route
--   passes it) but is NO LONGER TRUSTED for attribution: scans.scanned_by,
--   rentals.returned_by and assets.last_seen_by are now written from auth.uid().
--   A caller could previously attribute their action to any user id they liked.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
--   * No policy and no grant is changed.
--   * The signature is unchanged, so app/api/rentals/return/route.ts needs no
--     edit and can be updated later to stop sending p_user_id.
--   * checkout_asset is NOT touched by this migration. See the note below.
--
-- checkout_asset: RELATED BUT DIFFERENT, reported rather than assumed
--
--   checkout_asset DOES scope, at line 29:
--     WHERE id = p_asset_id AND organization_id = p_organization_id
--   but p_organization_id is a CALLER ARGUMENT. It is scoped to a trusted
--   input rather than to auth.uid().
--
--   Not exploitable through the app: app/api/rentals/checkout/route.ts:50
--   derives the org from the session before calling. It IS reachable directly
--   via PostgREST -- the function is granted to authenticated -- where a caller
--   may pass any organisation id and the function will scope to that instead.
--
--   Left out of B0 on purpose: B0 is the C-3 hotfix, and changing
--   checkout_asset's org source is a behaviour change to a working path that
--   deserves its own test round. Tracked for Patch B.
--
-- Rollback SQL is at the foot of this file.
-- ============================================================================

BEGIN;

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

COMMENT ON FUNCTION public.return_asset(uuid, uuid, text, text, text, double precision, double precision) IS
  'B0 (C-3 fix). Returns an active rental. The organisation is derived from '
  'auth.uid() via get_my_organization_id() and the asset must belong to it; a '
  'rental in another tenant reports rental_not_found. p_user_id is accepted for '
  'signature compatibility but ignored -- attribution uses auth.uid().';

-- Grants unchanged from the pre-B0 definition. CREATE OR REPLACE preserves
-- them, but they are restated so the intent is explicit and a future
-- CREATE (not REPLACE) cannot silently widen the surface.
REVOKE ALL ON FUNCTION public.return_asset(uuid, uuid, text, text, text, double precision, double precision)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_asset(uuid, uuid, text, text, text, double precision, double precision)
  TO authenticated, postgres, service_role;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Restores the pre-B0 body verbatim. NOTE: rolling back reopens C-3 --
-- any authenticated user can again return any active rental platform-wide.
--
--   BEGIN;
--   CREATE OR REPLACE FUNCTION public.return_asset (
--     p_rental_id uuid, p_user_id uuid,
--     p_return_condition text DEFAULT NULL, p_return_notes text DEFAULT NULL,
--     p_location_name text DEFAULT NULL,
--     p_latitude double precision DEFAULT NULL,
--     p_longitude double precision DEFAULT NULL
--   ) RETURNS json LANGUAGE plpgsql SECURITY DEFINER
--     SET search_path TO 'public','pg_temp' AS $rb$
--   DECLARE v_rental RECORD; v_scan_id UUID;
--   BEGIN
--     SELECT r.*, a.id AS a_id, a.organization_id AS a_org_id INTO v_rental
--     FROM rentals r JOIN assets a ON a.id = r.asset_id
--     WHERE r.id = p_rental_id AND r.status = 'active' FOR UPDATE OF r;
--     IF NOT FOUND THEN
--       RETURN json_build_object('success', false, 'error', 'rental_not_found');
--     END IF;
--     INSERT INTO scans (asset_id, scanned_at, scanned_by, location_name,
--                        latitude, longitude, scan_type, notes)
--     VALUES (v_rental.asset_id, NOW(), p_user_id, p_location_name,
--             p_latitude, p_longitude, 'return', p_return_notes)
--     RETURNING id INTO v_scan_id;
--     UPDATE rentals SET status='returned', actual_return_date=NOW(),
--            returned_by=p_user_id, return_condition=p_return_condition,
--            return_notes=p_return_notes, return_scan_id=v_scan_id,
--            updated_at=NOW()
--     WHERE id = p_rental_id;
--     UPDATE assets SET status='available', last_seen_at=NOW(),
--            last_seen_by=p_user_id,
--            current_location=COALESCE(p_location_name, current_location),
--            updated_at=NOW()
--     WHERE id = v_rental.asset_id;
--     RETURN json_build_object('success', true, 'scan_id', v_scan_id);
--   END; $rb$;
--   COMMIT;
-- ============================================================================
