CREATE TABLE "public"."vgp_alerts" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "asset_id"        uuid,
  "schedule_id"     uuid,
  "organization_id" uuid,
  "alert_type"      text                     NOT NULL,
  "alert_date"      date                     NOT NULL,
  "due_date"        date                     NOT NULL,
  "sent"            boolean                  DEFAULT false,
  "sent_at"         timestamp with time zone,
  "email_sent_to"   text[],
  "created_at"      timestamp with time zone DEFAULT now(),
  "resolved"        boolean                  DEFAULT false,
  "resolved_at"     timestamp with time zone,
  "resolved_reason" text,
  "urgency_level"   text,
  CONSTRAINT "vgp_alerts_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE,
  CONSTRAINT "vgp_alerts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "vgp_alerts_pkey" PRIMARY KEY (id),
  CONSTRAINT "vgp_alerts_schedule_id_fkey" FOREIGN KEY (schedule_id) REFERENCES public.vgp_schedules(id) ON DELETE CASCADE
);

ALTER TABLE "public"."vgp_alerts"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_vgp_alerts_daily_count ON public.vgp_alerts USING btree (alert_date, sent)
  WHERE (sent = true);

CREATE INDEX idx_vgp_alerts_dedup ON public.vgp_alerts USING btree (schedule_id, alert_type, alert_date, sent)
  WHERE (sent = true);

CREATE INDEX idx_vgp_alerts_org ON public.vgp_alerts USING btree (organization_id);

CREATE INDEX idx_vgp_alerts_resolved ON public.vgp_alerts USING btree (resolved, resolved_at);

CREATE INDEX idx_vgp_alerts_schedule_unresolved ON public.vgp_alerts USING btree (schedule_id, sent_at DESC)
  WHERE (resolved = false);

CREATE INDEX idx_vgp_alerts_sent_date ON public.vgp_alerts USING btree (organization_id, alert_date, sent)
  WHERE (sent = true);

CREATE POLICY "Users can view org alerts" ON "public"."vgp_alerts"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "vgp_alerts_org_select" ON "public"."vgp_alerts"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vgp_alerts" TO "anon", "authenticated", "postgres", "service_role";
