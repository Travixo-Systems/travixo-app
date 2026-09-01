CREATE OR REPLACE FUNCTION public.set_feature_flag (
  p_org_id  uuid,
  p_flag    text,
  p_enabled boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_actor   UUID := auth.uid();
  v_old     JSONB;
  v_new     JSONB;
  -- Hardcoded allowlist. Keep in sync with ALLOWED_FLAGS in the
  -- server action (lib/admin/featureFlags.ts).
  v_allowed TEXT[] := ARRAY[
    'beta_dashboard',
    'advanced_reports',
    'bulk_export'
  ];
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT (p_flag = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'invalid_flag: %', p_flag USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(feature_flags, '{}'::jsonb)
    INTO v_old
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found: %', p_org_id USING ERRCODE = 'P0002';
  END IF;

  -- Set exactly one key; leave all other keys intact.
  v_new := v_old || jsonb_build_object(p_flag, p_enabled);

  UPDATE public.organizations
     SET feature_flags = v_new,
         updated_at    = now()
   WHERE id = p_org_id;

  INSERT INTO public.admin_audit_log
    (actor_id, action, target_org_id, target_user_id, before, after)
  VALUES
    (v_actor,
     'set_feature_flag',
     p_org_id,
     NULL,
     jsonb_build_object('feature_flags', v_old),
     jsonb_build_object('feature_flags', v_new, 'flag', p_flag, 'enabled', p_enabled));

  RETURN jsonb_build_object('flag', p_flag, 'before', v_old, 'after', v_new);
END;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_feature_flag"(uuid, text, boolean) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."set_feature_flag"(uuid, text, boolean) FROM PUBLIC;
