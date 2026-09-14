CREATE TABLE "public"."vgp_digest_deliveries" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"             uuid,
  "organization_id"     uuid,
  "recipient_email"     text                     NOT NULL,
  "period"              text                     NOT NULL DEFAULT 'weekly'::text,
  "item_count"          integer                  NOT NULL,
  "provider_message_id" text,
  "sent_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "vgp_digest_deliveries_item_count_check" CHECK ((item_count > 0)),
  CONSTRAINT "vgp_digest_deliveries_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL,
  CONSTRAINT "vgp_digest_deliveries_period_check" CHECK ((period = ANY (ARRAY['weekly'::text, 'daily'::text]))),
  CONSTRAINT "vgp_digest_deliveries_pkey" PRIMARY KEY (id),
  CONSTRAINT "vgp_digest_deliveries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE "public"."vgp_digest_deliveries"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_vgp_digest_deliveries_sent_at ON public.vgp_digest_deliveries USING btree (sent_at DESC);

CREATE INDEX idx_vgp_digest_deliveries_user ON public.vgp_digest_deliveries USING btree (user_id, sent_at DESC);

CREATE POLICY "vgp_digest_deliveries_select_own" ON "public"."vgp_digest_deliveries"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = auth.uid()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vgp_digest_deliveries" TO "postgres", "service_role";

COMMENT ON COLUMN "public"."vgp_digest_deliveries"."provider_message_id" IS 'Resend message id, as returned by the send. The traceable artifact: it can be looked up in the provider dashboard to confirm actual delivery.';

COMMENT ON TABLE "public"."vgp_digest_deliveries" IS 'One row per digest email Resend acknowledged. Exists because the outbox deletes its rows on success, which made an empty queue indistinguishable from a feature that had never worked.';

REVOKE ALL ON TABLE "public"."vgp_digest_deliveries" FROM "authenticated";

GRANT SELECT ON TABLE "public"."vgp_digest_deliveries" TO "authenticated";
