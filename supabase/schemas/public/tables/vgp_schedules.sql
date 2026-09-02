CREATE TABLE "public"."vgp_schedules" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "asset_id"             uuid,
  "organization_id"      uuid,
  "interval_months"      integer                  NOT NULL,
  "last_inspection_date" date,
  "next_due_date"        date                     NOT NULL,
  "inspector_name"       text,
  "inspector_company"    text,
  "certification_number" text,
  "status"               text                     DEFAULT 'active'::text,
  "notes"                text,
  "created_at"           timestamp with time zone DEFAULT now(),
  "updated_at"           timestamp with time zone DEFAULT now(),
  "archived_at"          timestamp with time zone,
  "archived_by"          uuid,
  "archive_reason"       text,
  "edit_history"         jsonb                    DEFAULT '[]'::jsonb,
  "created_by"           text,
  "rapport_url"          text,
  "inspection_location"  text                     DEFAULT 'depot'::text,
  CONSTRAINT "vgp_schedules_archived_by_fkey" FOREIGN KEY (archived_by) REFERENCES public.users(id),
  CONSTRAINT "vgp_schedules_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  CONSTRAINT "vgp_schedules_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "vgp_schedules_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."vgp_schedules"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_vgp_schedules_active ON public.vgp_schedules USING btree (organization_id, next_due_date)
  WHERE (archived_at IS NULL);

CREATE INDEX idx_vgp_schedules_archived_by ON public.vgp_schedules USING btree (archived_by);

CREATE INDEX idx_vgp_schedules_archived ON public.vgp_schedules USING btree (archived_at)
  WHERE (archived_at IS NOT NULL);

CREATE INDEX idx_vgp_schedules_asset ON public.vgp_schedules USING btree (asset_id);

CREATE INDEX idx_vgp_schedules_due_date ON public.vgp_schedules USING btree (next_due_date);

CREATE INDEX idx_vgp_schedules_org ON public.vgp_schedules USING btree (organization_id);

CREATE TRIGGER trg_resolve_vgp_alerts
  AFTER UPDATE ON public.vgp_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_vgp_alerts_on_completion();

CREATE POLICY "Users can delete org schedules" ON "public"."vgp_schedules"
  FOR DELETE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can delete own org vgp_schedules" ON "public"."vgp_schedules"
  FOR DELETE
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can insert org schedules" ON "public"."vgp_schedules"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can insert own org vgp_schedules" ON "public"."vgp_schedules"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can update org schedules" ON "public"."vgp_schedules"
  FOR UPDATE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can update own org vgp_schedules" ON "public"."vgp_schedules"
  FOR UPDATE
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can view org schedules" ON "public"."vgp_schedules"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can view own org vgp_schedules" ON "public"."vgp_schedules"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vgp_schedules" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."vgp_schedules"."archive_reason" IS 'Reason for archiving (required for compliance)';

COMMENT ON COLUMN "public"."vgp_schedules"."archived_at" IS 'Soft delete timestamp - schedule hidden but preserved for audit trail';

COMMENT ON COLUMN "public"."vgp_schedules"."archived_by" IS 'User who archived the schedule';

COMMENT ON COLUMN "public"."vgp_schedules"."created_by" IS 'Name of the person who configured this VGP monitoring schedule';

COMMENT ON COLUMN "public"."vgp_schedules"."edit_history" IS 'Audit trail: [{edited_at, edited_by, field_changed, old_value, new_value, reason}]';

COMMENT ON COLUMN "public"."vgp_schedules"."inspector_name" IS 'Name of the inspector who performs the physical VGP inspection';
