CREATE OR REPLACE FUNCTION public.track_asset_creation()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."track_asset_creation"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";
