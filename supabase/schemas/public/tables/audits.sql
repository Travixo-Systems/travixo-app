CREATE TABLE "public"."audits" (
  "id"              uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "organization_id" uuid,
  "name"            character varying(255)   NOT NULL,
  "status"          character varying(50)    DEFAULT 'planned'::character varying,
  "scheduled_date"  date,
  "started_at"      timestamp with time zone,
  "completed_at"    timestamp with time zone,
  "total_assets"    integer                  DEFAULT 0,
  "verified_assets" integer                  DEFAULT 0,
  "missing_assets"  integer                  DEFAULT 0,
  "created_by"      uuid,
  "created_at"      timestamp with time zone DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "audits_pkey" PRIMARY KEY (id),
  CONSTRAINT "audits_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "audits_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE "public"."audits"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can delete audits in their organization" ON "public"."audits"
  FOR DELETE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying])::text[]))))));

CREATE POLICY "Users can create audits in their organization" ON "public"."audits"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can update audits in their organization" ON "public"."audits"
  FOR UPDATE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can view audits in their organization" ON "public"."audits"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audits" TO "anon", "authenticated", "postgres", "service_role";
