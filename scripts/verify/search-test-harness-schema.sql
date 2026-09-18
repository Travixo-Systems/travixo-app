-- Block 3.6 harness: production's REAL policies, copied verbatim from
-- supabase/schemas/. The block 3 harness used one simplified policy per table
-- (organization_id = get_my_organization_id()), which is NOT what production
-- runs. Production has 4 SELECT policies on assets, 2 on scans, 3 on users --
-- all permissive, therefore OR'd.

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL
);

CREATE TABLE public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid
);

CREATE TABLE public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name text,
  last_name text,
  email varchar(255) NOT NULL
);

CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  serial_number varchar(255),
  current_location varchar(255),
  archived_at timestamptz
);

CREATE TABLE public.scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid REFERENCES public.assets(id) ON DELETE CASCADE,
  scanned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  scan_type varchar(50) DEFAULT 'check',
  notes text,
  location_name varchar(255),
  latitude numeric(10,8),
  longitude numeric(11,8),
  scanned_at timestamptz DEFAULT timezone('utc', now())
);

-- Production's index set on scans.
CREATE INDEX idx_scans_asset ON public.scans USING btree (asset_id);
CREATE INDEX idx_scans_date  ON public.scans USING btree (scanned_at);

ALTER TABLE public.scans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users  ENABLE ROW LEVEL SECURITY;

-- ---- functions referenced by the policies, verbatim ----------------------

CREATE OR REPLACE FUNCTION public.is_super_admin()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
  AS $function$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.get_my_organization_id()
  RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
  AS $function$ SELECT organization_id FROM public.users WHERE id = auth.uid() $function$;

-- ---- assets: FOUR permissive SELECT policies, verbatim -------------------

CREATE POLICY "Users can view assets in own organization" ON "public"."assets"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "assets_select_org_authenticated" ON "public"."assets"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "assets_select_same_org" ON "public"."assets"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

CREATE POLICY "super_admin_read_all_assets" ON "public"."assets"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

-- ---- scans: TWO permissive SELECT policies, verbatim ---------------------

CREATE POLICY "scans_select_same_org" ON "public"."scans"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.assets a
  WHERE ((a.id = scans.asset_id) AND (a.organization_id IN ( SELECT u.organization_id
           FROM public.users u
          WHERE (u.id = auth.uid())))))));

CREATE POLICY "super_admin_read_all_scans" ON "public"."scans"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

-- ---- users: THREE permissive SELECT policies, verbatim -------------------

CREATE POLICY "Users can view own profile" ON "public"."users"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = id));

CREATE POLICY "super_admin_read_all_users" ON "public"."users"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

CREATE POLICY "users_select_same_org" ON "public"."users"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id = public.get_my_organization_id()));

GRANT SELECT ON public.scans, public.assets, public.users, public.platform_admins TO authenticated;
