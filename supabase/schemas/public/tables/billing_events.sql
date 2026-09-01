CREATE TABLE "public"."billing_events" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"        uuid                     NOT NULL,
  "event_type"             text                     NOT NULL,
  "stripe_event_id"        text,
  "stripe_subscription_id" text,
  "stripe_invoice_id"      text,
  "amount"                 numeric(10,2),
  "currency"               text                     DEFAULT 'eur'::text,
  "status"                 text,
  "metadata"               jsonb                    DEFAULT '{}'::jsonb,
  "created_at"             timestamp with time zone DEFAULT now(),
  CONSTRAINT "billing_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "billing_events_stripe_event_id_key" UNIQUE (stripe_event_id),
  CONSTRAINT "billing_events_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

ALTER TABLE "public"."billing_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_billing_events_org ON public.billing_events USING btree (organization_id);

CREATE INDEX idx_billing_events_stripe_event ON public.billing_events USING btree (stripe_event_id);

CREATE POLICY "Users can view own org billing events" ON "public"."billing_events"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."billing_events" TO "anon", "authenticated", "postgres", "service_role";
