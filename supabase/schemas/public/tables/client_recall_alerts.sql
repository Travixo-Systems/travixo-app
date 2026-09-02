CREATE TABLE "public"."client_recall_alerts" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid                     NOT NULL,
  "rental_id"       uuid                     NOT NULL,
  "client_id"       uuid,
  "asset_id"        uuid                     NOT NULL,
  "alert_type"      text                     NOT NULL,
  "vgp_schedule_id" uuid,
  "next_due_date"   date                     NOT NULL,
  "sent"            boolean                  NOT NULL DEFAULT false,
  "sent_at"         timestamp with time zone,
  "email_sent_to"   text[],
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "client_recall_alerts_alert_type_check" CHECK ((alert_type = ANY (ARRAY['recall_30day'::text, 'recall_14day'::text, 'manual_recall'::text]))),
  CONSTRAINT "client_recall_alerts_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id),
  CONSTRAINT "client_recall_alerts_pkey" PRIMARY KEY (id),
  CONSTRAINT "client_recall_alerts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT "client_recall_alerts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT "client_recall_alerts_rental_id_fkey" FOREIGN KEY (rental_id) REFERENCES public.rentals(id),
  CONSTRAINT "client_recall_alerts_vgp_schedule_id_fkey" FOREIGN KEY (vgp_schedule_id) REFERENCES public.vgp_schedules(id)
);

ALTER TABLE "public"."client_recall_alerts"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_recall_alerts_asset ON public.client_recall_alerts USING btree (asset_id);

CREATE INDEX idx_recall_alerts_client ON public.client_recall_alerts USING btree (client_id);

CREATE UNIQUE INDEX idx_recall_alerts_dedup ON public.client_recall_alerts USING btree (rental_id, alert_type, next_due_date);

CREATE INDEX idx_recall_alerts_org ON public.client_recall_alerts USING btree (organization_id);

CREATE INDEX idx_recall_alerts_rental ON public.client_recall_alerts USING btree (rental_id);

CREATE INDEX idx_recall_alerts_vgp_schedule ON public.client_recall_alerts USING btree (vgp_schedule_id);

CREATE POLICY "Users can view own org recall alerts" ON "public"."client_recall_alerts"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."client_recall_alerts" TO "anon", "authenticated", "postgres", "service_role";
