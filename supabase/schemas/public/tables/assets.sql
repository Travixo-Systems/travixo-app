CREATE TABLE "public"."assets" (
  "id"               uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "organization_id"  uuid,
  "category_id"      uuid,
  "name"             character varying(255)   NOT NULL,
  "description"      text,
  "serial_number"    character varying(255),
  "purchase_date"    date,
  "purchase_price"   numeric(10,2),
  "qr_code"          character varying(255)   NOT NULL,
  "qr_url"           character varying(255)   NOT NULL,
  "status"           character varying(50)    DEFAULT 'available'::character varying,
  "current_location" character varying(255),
  "created_at"       timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "updated_at"       timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "current_value"    numeric(10,2),
  "last_seen_at"     timestamp with time zone,
  "last_seen_by"     uuid,
  "is_demo_data"     boolean                  DEFAULT false,
  "archived_at"      timestamp with time zone,
  "archived_by"      uuid,
  "archive_reason"   text,
  CONSTRAINT "assets_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.asset_categories(id) ON DELETE SET NULL,
  CONSTRAINT "assets_pkey" PRIMARY KEY (id),
  CONSTRAINT "assets_qr_code_key" UNIQUE (qr_code),
  CONSTRAINT "assets_qr_url_key" UNIQUE (qr_url),
  CONSTRAINT "assets_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "assets_last_seen_by_fkey" FOREIGN KEY (last_seen_by) REFERENCES public.users(id)
);

ALTER TABLE "public"."assets"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_assets_organization ON public.assets USING btree (organization_id);

CREATE INDEX idx_assets_qr_code ON public.assets USING btree (qr_code);

CREATE INDEX idx_assets_status ON public.assets USING btree (status);

CREATE TRIGGER track_asset_creation_trigger
  AFTER INSERT OR DELETE OR UPDATE OF status, organization_id ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.track_asset_creation();

CREATE TRIGGER trg_enforce_asset_limit
  BEFORE INSERT ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_asset_limit();

CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Users can view assets in own organization" ON "public"."assets"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "assets_delete_org" ON "public"."assets"
  FOR DELETE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "assets_delete_same_org" ON "public"."assets"
  FOR DELETE
  TO "authenticated"
  USING ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

CREATE POLICY "assets_insert_org" ON "public"."assets"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "assets_insert_same_org" ON "public"."assets"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

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

CREATE POLICY "assets_update_org_authenticated" ON "public"."assets"
  FOR UPDATE
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))))
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "assets_update_same_org" ON "public"."assets"
  FOR UPDATE
  TO "authenticated"
  USING ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))))
  WITH CHECK ((organization_id IN ( SELECT u.organization_id
   FROM public.users u
  WHERE (u.id = auth.uid()))));

CREATE POLICY "super_admin_read_all_assets" ON "public"."assets"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."assets" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."assets"."last_seen_at" IS 'Timestamp of last QR scan';

COMMENT ON COLUMN "public"."assets"."last_seen_by" IS 'User who last scanned (nullable for public scans)';
