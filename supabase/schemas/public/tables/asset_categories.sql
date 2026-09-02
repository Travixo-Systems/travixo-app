CREATE TABLE "public"."asset_categories" (
  "id"              uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "organization_id" uuid,
  "name"            character varying(255)   NOT NULL,
  "created_at"      timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "asset_categories_pkey" PRIMARY KEY (id),
  CONSTRAINT "asset_categories_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

ALTER TABLE "public"."asset_categories"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_categories_delete_same_org" ON "public"."asset_categories"
  FOR DELETE
  TO "authenticated"
  USING ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

CREATE POLICY "asset_categories_insert_same_org" ON "public"."asset_categories"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

CREATE POLICY "asset_categories_select_same_org" ON "public"."asset_categories"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

CREATE POLICY "asset_categories_update_same_org" ON "public"."asset_categories"
  FOR UPDATE
  TO "authenticated"
  USING ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))))
  WITH CHECK ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."asset_categories" TO "authenticated", "postgres", "service_role";

COMMENT ON TABLE "public"."asset_categories" IS 'Per-organization asset category labels. RLS: same-org authenticated members only. Read by the public scan page indirectly through get_asset_by_qr, which is SECURITY DEFINER and unaffected by these policies.';
