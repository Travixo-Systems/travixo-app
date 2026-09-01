CREATE TABLE "public"."scans" (
  "id"            uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "asset_id"      uuid,
  "scanned_by"    uuid,
  "scan_type"     character varying(50)    DEFAULT 'check'::character varying,
  "notes"         text,
  "location_name" character varying(255),
  "latitude"      numeric(10,8),
  "longitude"     numeric(11,8),
  "scanned_at"    timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "scans_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  CONSTRAINT "scans_pkey" PRIMARY KEY (id),
  CONSTRAINT "scans_scanned_by_fkey" FOREIGN KEY (scanned_by) REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE "public"."scans"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_scans_asset ON public.scans USING btree (asset_id);

CREATE INDEX idx_scans_date ON public.scans USING btree (scanned_at);

CREATE POLICY "scans_insert_public_qr_log" ON "public"."scans"
  FOR INSERT
  TO "anon", "authenticated"
  WITH CHECK (((EXISTS ( SELECT 1
   FROM public.assets a
  WHERE ((a.id = scans.asset_id) AND (a.archived_at IS NULL)))) AND ((scanned_by IS NULL) OR (scanned_by = auth.uid()))));

CREATE POLICY "scans_select_same_org" ON "public"."scans"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.assets a
  WHERE ((a.id = scans.asset_id) AND (a.organization_id IN ( SELECT u.organization_id
           FROM public.users u
          WHERE (u.id = auth.uid())))))));

CREATE POLICY "users_view_org_scans" ON "public"."scans"
  FOR SELECT
  TO PUBLIC
  USING (((auth.uid() IS NOT NULL) AND (asset_id IN ( SELECT assets.id
   FROM public.assets
  WHERE (assets.organization_id IN ( SELECT users.organization_id
           FROM public.users
          WHERE (users.id = auth.uid())))))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."scans" TO "anon", "authenticated", "postgres", "service_role";
