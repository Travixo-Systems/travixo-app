-- ============================================================================
-- B1: checkout_asset() derives its own tenant  (C-3 sibling)
-- ============================================================================
--
-- WHAT THIS CLOSES
--
--   checkout_asset() DOES scope -- unlike return_asset() before B0, which did
--   not scope at all -- but it scopes to a CALLER ARGUMENT:
--
--     SELECT * INTO v_asset FROM assets
--     WHERE id = p_asset_id AND organization_id = p_organization_id
--     FOR UPDATE;
--
--   p_organization_id is supplied by the caller. The function is SECURITY
--   DEFINER and granted to authenticated, so it is reachable directly through
--   PostgREST, where the caller chooses that value. Passing another tenant's
--   organisation id makes the function scope to THAT tenant and check out
--   their asset -- creating a rentals row, a scans row, and flipping the asset
--   to 'in_use', all inside an organisation the caller does not belong to.
--
--   Not exploitable through the application: app/api/rentals/checkout/route.ts
--   resolves the org from the session (route.ts:37-47) before calling. The
--   defect is that the function's safety depends entirely on every caller
--   being careful, forever.
--
--   Second defect, the same one B0 fixed in return_asset(): p_user_id is
--   trusted for attribution. scans.scanned_by, rentals.checked_out_by and
--   assets.last_seen_by were written from it, so a caller could attribute a
--   checkout to any user id they chose.
--
--   Third, narrower: p_client_id was inserted into rentals.client_id with no
--   check that the client belongs to the organisation. This is finding M-2 --
--   a child row referencing a parent in another tenant. Closed here because it
--   is the same tenant-scoping question and the same statement.
--
-- THE FIX
--
--   Derive the organisation inside the function from auth.uid() via
--   get_my_organization_id(), and ignore p_organization_id entirely. Derive
--   the actor from auth.uid(). Validate p_client_id against the derived org.
--
--   Same approach as B0 on return_asset(), and the pattern record_inspection()
--   has used all along.
--
-- SIGNATURE UNCHANGED
--
--   p_organization_id and p_user_id are still accepted so the signature and
--   the calling route are untouched and no overload is created. Both are now
--   ignored. app/api/rentals/checkout/route.ts needs no edit; it can stop
--   sending them later.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--
--   No policy is altered. Grants are restated exactly as they already are.
--
-- BEHAVIOUR CHANGE TO NOTE
--
--   A service_role caller has no public.users row, so get_my_organization_id()
--   returns NULL and checkout is refused. Nothing calls this under the service
--   role today -- app/api/rentals/checkout/route.ts:52 is the only call site
--   and it uses the anon-key session client -- but a future server-side caller
--   would need a different path.
--
-- Rollback SQL is at the foot of this file.
-- ============================================================================

BEGIN;

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
  -- B1: derived, never accepted. p_organization_id and p_user_id are ignored.
  v_org    UUID := public.get_my_organization_id();
  v_actor  UUID := auth.uid();
BEGIN
  -- B1: a caller with no organisation cannot check anything out. Refused up
  -- front so the query below is never reached with v_org NULL.
  IF v_org IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'asset_not_found');
  END IF;

  -- 1. Lock the asset row to prevent race conditions.
  --    B1: scoped to the CALLER'S organisation, not to the argument.
  SELECT * INTO v_asset
  FROM assets
  WHERE id = p_asset_id AND organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'asset_not_found');
  END IF;

  -- B1: a client, when given, must belong to the same organisation (M-2).
  IF p_client_id IS NOT NULL THEN
    PERFORM 1 FROM clients
     WHERE id = p_client_id AND organization_id = v_org;
    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'error', 'client_not_found');
    END IF;
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
      AND organization_id = v_org
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

  -- 4. Create scan record (type: 'checkout').
  --    B1: attribution from auth.uid(), not from p_user_id.
  INSERT INTO scans (asset_id, scanned_at, scanned_by, location_name, latitude, longitude, scan_type, notes)
  VALUES (p_asset_id, NOW(), v_actor, p_location_name, p_latitude, p_longitude, 'checkout', p_checkout_notes)
  RETURNING id INTO v_scan_id;

  -- 5. Create rental record (now with optional client_id)
  INSERT INTO rentals (
    organization_id, asset_id, client_name, client_contact,
    checked_out_by, checkout_date, expected_return_date,
    checkout_notes, status, checkout_scan_id, client_id
  )
  VALUES (
    v_org, p_asset_id, p_client_name, p_client_contact,
    v_actor, NOW(), p_expected_return_date,
    p_checkout_notes, 'active', v_scan_id, p_client_id
  )
  RETURNING id INTO v_rental_id;

  -- 6. Update asset status
  UPDATE assets
  SET status = 'in_use',
      last_seen_at = NOW(),
      last_seen_by = v_actor,
      updated_at = NOW()
  WHERE id = p_asset_id;

  RETURN json_build_object(
    'success', true,
    'rental_id', v_rental_id,
    'scan_id', v_scan_id
  );
END;
$function$;

COMMENT ON FUNCTION public.checkout_asset(uuid, uuid, uuid, text, text, timestamp with time zone, text, text, double precision, double precision, uuid) IS
  'B1 (C-3 sibling). Checks out an asset. The organisation is derived from '
  'auth.uid() via get_my_organization_id(); p_organization_id and p_user_id are '
  'accepted for signature compatibility but IGNORED. p_client_id must belong to '
  'the derived organisation (M-2). Attribution uses auth.uid().';

-- Grants: authenticated ONLY.
--
-- REVOKE strips only the roles it names, and CREATE OR REPLACE preserves the
-- existing ACL -- so revoking from PUBLIC and anon alone would leave the
-- pre-B1 service_role and postgres grants untouched. Verified locally: the ACL
-- still read `service_role=X/postgres` until they were named explicitly.
-- They are therefore revoked by name.
--
-- Dropping service_role is deliberate and currently unreachable: the only
-- caller is app/api/rentals/checkout/route.ts:52, which uses the anon-key
-- session client. It is also consistent with the function's own logic after
-- B1 -- service_role has no public.users row, so get_my_organization_id()
-- returns NULL and the call would be refused regardless.
--
-- postgres retains effective access as the owner/superuser whatever the ACL
-- says; revoking the explicit grant simply stops it being a granted path.
REVOKE ALL ON FUNCTION public.checkout_asset(uuid, uuid, uuid, text, text, timestamp with time zone, text, text, double precision, double precision, uuid)
  FROM PUBLIC, anon, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.checkout_asset(uuid, uuid, uuid, text, text, timestamp with time zone, text, text, double precision, double precision, uuid)
  TO authenticated;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Restores the pre-B1 body. NOTE: rolling back reopens the cross-tenant
-- checkout, the forged attribution and the unvalidated client_id.
--
-- The pre-B1 grant also included postgres and service_role; restore those too
-- if the rollback is taken.
--
--   BEGIN;
--   CREATE OR REPLACE FUNCTION public.checkout_asset (
--     p_asset_id uuid, p_organization_id uuid, p_user_id uuid,
--     p_client_name text, p_client_contact text DEFAULT NULL,
--     p_expected_return_date timestamptz DEFAULT NULL,
--     p_checkout_notes text DEFAULT NULL, p_location_name text DEFAULT NULL,
--     p_latitude double precision DEFAULT NULL,
--     p_longitude double precision DEFAULT NULL,
--     p_client_id uuid DEFAULT NULL
--   ) RETURNS json LANGUAGE plpgsql SECURITY DEFINER
--     SET search_path TO 'public','pg_temp' AS $rb$
--   DECLARE
--     v_asset RECORD; v_active_rental RECORD; v_vgp_blocked BOOLEAN := FALSE;
--     v_scan_id UUID; v_rental_id UUID;
--   BEGIN
--     SELECT * INTO v_asset FROM assets
--     WHERE id = p_asset_id AND organization_id = p_organization_id FOR UPDATE;
--     IF NOT FOUND THEN
--       RETURN json_build_object('success', false, 'error', 'asset_not_found');
--     END IF;
--     SELECT id INTO v_active_rental FROM rentals
--     WHERE asset_id = p_asset_id AND status = 'active' LIMIT 1;
--     IF FOUND THEN
--       RETURN json_build_object('success', false, 'error', 'already_rented');
--     END IF;
--     SELECT EXISTS (
--       SELECT 1 FROM vgp_schedules
--       WHERE asset_id = p_asset_id AND organization_id = p_organization_id
--         AND archived_at IS NULL
--         AND ((next_due_date < NOW() AND status != 'completed')
--          OR EXISTS (SELECT 1 FROM vgp_inspections vi
--                     WHERE vi.asset_id = p_asset_id
--                       AND vi.result = 'NON_CONFORME'
--                       AND vi.inspection_date = (SELECT MAX(inspection_date)
--                             FROM vgp_inspections WHERE asset_id = p_asset_id)))
--     ) INTO v_vgp_blocked;
--     IF v_vgp_blocked THEN
--       RETURN json_build_object('success', false, 'error', 'vgp_blocked');
--     END IF;
--     INSERT INTO scans (asset_id, scanned_at, scanned_by, location_name,
--                        latitude, longitude, scan_type, notes)
--     VALUES (p_asset_id, NOW(), p_user_id, p_location_name, p_latitude,
--             p_longitude, 'checkout', p_checkout_notes)
--     RETURNING id INTO v_scan_id;
--     INSERT INTO rentals (organization_id, asset_id, client_name,
--            client_contact, checked_out_by, checkout_date,
--            expected_return_date, checkout_notes, status, checkout_scan_id,
--            client_id)
--     VALUES (p_organization_id, p_asset_id, p_client_name, p_client_contact,
--             p_user_id, NOW(), p_expected_return_date, p_checkout_notes,
--             'active', v_scan_id, p_client_id)
--     RETURNING id INTO v_rental_id;
--     UPDATE assets SET status='in_use', last_seen_at=NOW(),
--            last_seen_by=p_user_id, updated_at=NOW()
--     WHERE id = p_asset_id;
--     RETURN json_build_object('success', true, 'rental_id', v_rental_id,
--                              'scan_id', v_scan_id);
--   END; $rb$;
--   GRANT EXECUTE ON FUNCTION public.checkout_asset(uuid, uuid, uuid, text, text,
--     timestamp with time zone, text, text, double precision, double precision, uuid)
--     TO authenticated, postgres, service_role;
--   COMMIT;
-- ============================================================================
