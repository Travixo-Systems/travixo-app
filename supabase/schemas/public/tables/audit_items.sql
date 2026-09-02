CREATE TABLE "public"."audit_items" (
  "id"          uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "audit_id"    uuid,
  "asset_id"    uuid,
  "status"      character varying(50)    DEFAULT 'pending'::character varying,
  "verified_at" timestamp with time zone,
  "verified_by" uuid,
  "notes"       text,
  CONSTRAINT "audit_items_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  CONSTRAINT "audit_items_audit_id_asset_id_key" UNIQUE (audit_id, asset_id),
  CONSTRAINT "audit_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "audit_items_audit_id_fkey" FOREIGN KEY (audit_id) REFERENCES public.audits(id) ON DELETE CASCADE,
  CONSTRAINT "audit_items_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE "public"."audit_items"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage audit items for their audits" ON "public"."audit_items"
  FOR ALL
  TO PUBLIC
  USING ((audit_id IN ( SELECT audits.id
   FROM public.audits
  WHERE (audits.organization_id IN ( SELECT users.organization_id
           FROM public.users
          WHERE (users.id = auth.uid()))))));

CREATE POLICY "Users can view audit items for their audits" ON "public"."audit_items"
  FOR SELECT
  TO PUBLIC
  USING ((audit_id IN ( SELECT audits.id
   FROM public.audits
  WHERE (audits.organization_id IN ( SELECT users.organization_id
           FROM public.users
          WHERE (users.id = auth.uid()))))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_items" TO "anon", "authenticated", "postgres", "service_role";
