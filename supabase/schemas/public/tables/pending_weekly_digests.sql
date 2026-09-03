CREATE TABLE "public"."pending_weekly_digests" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         uuid                     NOT NULL,
  "organization_id" uuid                     NOT NULL,
  "schedule_id"     uuid                     NOT NULL,
  "asset_id"        uuid,
  "alert_type"      text                     NOT NULL,
  "urgency_level"   text,
  "due_date"        date                     NOT NULL,
  "days_until_due"  integer                  NOT NULL,
  "queued_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pending_weekly_digests_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  CONSTRAINT "pending_weekly_digests_dedup_key" UNIQUE (user_id, schedule_id, alert_type),
  CONSTRAINT "pending_weekly_digests_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "pending_weekly_digests_pkey" PRIMARY KEY (id),
  CONSTRAINT "pending_weekly_digests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT "pending_weekly_digests_schedule_id_fkey" FOREIGN KEY (schedule_id) REFERENCES public.vgp_schedules(id) ON DELETE CASCADE
);

ALTER TABLE "public"."pending_weekly_digests"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_pending_weekly_org ON public.pending_weekly_digests USING btree (organization_id);

CREATE INDEX idx_pending_weekly_user ON public.pending_weekly_digests USING btree (user_id);

CREATE POLICY "pending_weekly_select_own" ON "public"."pending_weekly_digests"
  FOR SELECT
  TO PUBLIC
  USING ((user_id = auth.uid()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."pending_weekly_digests" TO "authenticated", "postgres", "service_role";

COMMENT ON TABLE "public"."pending_weekly_digests" IS 'Alerts deferred for users on weekly_digest. Written by the daily VGP cron, drained by /api/cron/vgp-weekly-digest on Mondays. Rows are removed only after their email is accepted.';
