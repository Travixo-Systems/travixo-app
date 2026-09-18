CREATE OR REPLACE FUNCTION public.enforce_users_identity_invariant()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'pg_catalog', 'public'
  AS $function$
BEGIN
  -- Only constrain sessions that arrive through PostgREST as a browser client.
  -- service_role, postgres and SECURITY DEFINER contexts are trusted here
  -- because they are already gated by application authorization.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  -- (1) Self-edit: neither authority column may change.
  --     IS DISTINCT FROM so NULL transitions are caught too.
  IF OLD.id = auth.uid() THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION
        'users_identity_invariant: a session may not change its own organization_id (attempted % -> %). Tenant membership is assigned by invitation acceptance or signup, both of which run with elevated privileges.',
        OLD.organization_id, NEW.organization_id
        USING ERRCODE = '42501';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION
        'users_identity_invariant: a session may not change its own role (attempted % -> %). Role changes go through /api/team, which enforces the owner and admin rules.',
        OLD.role, NEW.role
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  -- (2) Any other row: organization_id may only be cleared, never reassigned.
  --     This is the member-removal path (org -> NULL). Moving a row from one
  --     tenant to another is never a legitimate authenticated operation.
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     AND NEW.organization_id IS NOT NULL THEN
    RAISE EXCEPTION
      'users_identity_invariant: organization_id may only be set to NULL by a session (attempted % -> %). Assigning a user to an organization requires invitation acceptance.',
      OLD.organization_id, NEW.organization_id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_users_identity_invariant"() TO "postgres", "service_role";

COMMENT ON FUNCTION "public"."enforce_users_identity_invariant"() IS 'A0 (C-1 containment). Blocks self-service tenant moves and self role changes for anon/authenticated sessions. SECURITY INVOKER so current_user reflects the caller. Does not alter any policy or grant; the update-surface gate still fails until Patch A narrows the column grants.';

REVOKE ALL ON FUNCTION "public"."enforce_users_identity_invariant"() FROM PUBLIC;
