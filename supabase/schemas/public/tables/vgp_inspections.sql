CREATE TABLE "public"."vgp_inspections" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "asset_id"              uuid,
  "schedule_id"           uuid,
  "organization_id"       uuid,
  "inspection_date"       date                     NOT NULL,
  "inspector_name"        text                     NOT NULL,
  "inspector_company"     text,
  "certification_number"  text,
  "result"                text                     NOT NULL,
  "findings"              text,
  "next_inspection_date"  date,
  "certificate_url"       text,
  "certificate_file_name" text,
  "performed_by"          uuid,
  "created_at"            timestamp with time zone DEFAULT now(),
  "verification_type"     text                     NOT NULL DEFAULT 'PERIODIQUE'::text,
  "observations"          text                     NOT NULL DEFAULT 'RAS'::text,
  CONSTRAINT "vgp_inspections_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  CONSTRAINT "vgp_inspections_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "vgp_inspections_performed_by_fkey" FOREIGN KEY (performed_by) REFERENCES public.users(id),
  CONSTRAINT "vgp_inspections_pkey" PRIMARY KEY (id),
  CONSTRAINT "vgp_inspections_result_check" CHECK ((result = ANY (ARRAY['passed'::text, 'conditional'::text, 'failed'::text]))),
  CONSTRAINT "vgp_inspections_verification_type_check" CHECK ((verification_type = ANY (ARRAY['PERIODIQUE'::text, 'INITIALE'::text, 'REMISE_SERVICE'::text]))),
  CONSTRAINT "vgp_inspections_schedule_id_fkey" FOREIGN KEY (schedule_id) REFERENCES public.vgp_schedules(id) ON DELETE SET NULL
);

ALTER TABLE "public"."vgp_inspections"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_vgp_inspections_asset ON public.vgp_inspections USING btree (asset_id);

CREATE INDEX idx_vgp_inspections_org ON public.vgp_inspections USING btree (organization_id);

CREATE INDEX idx_vgp_inspections_verification_type ON public.vgp_inspections USING btree (verification_type);

CREATE POLICY "Users can insert org inspections" ON "public"."vgp_inspections"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can view org inspections" ON "public"."vgp_inspections"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vgp_inspections" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."vgp_inspections"."observations" IS 'Observations de l''inspecteur (utiliser "RAS" si aucune remarque)';

COMMENT ON COLUMN "public"."vgp_inspections"."verification_type" IS 'Type de vérification VGP (PERIODIQUE/INITIALE/REMISE_SERVICE)';
