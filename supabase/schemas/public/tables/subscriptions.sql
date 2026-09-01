CREATE TABLE "public"."subscriptions" (
  "id"                     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"        uuid                     NOT NULL,
  "plan_id"                uuid                     NOT NULL,
  "status"                 text                     NOT NULL DEFAULT 'active'::text,
  "billing_cycle"          text                     NOT NULL DEFAULT 'monthly'::text,
  "current_period_start"   timestamp with time zone NOT NULL DEFAULT now(),
  "current_period_end"     timestamp with time zone NOT NULL,
  "cancel_at_period_end"   boolean                  DEFAULT false,
  "cancelled_at"           timestamp with time zone,
  "trial_start"            timestamp with time zone,
  "trial_end"              timestamp with time zone,
  "metadata"               jsonb                    DEFAULT '{}'::jsonb,
  "created_at"             timestamp with time zone DEFAULT now(),
  "updated_at"             timestamp with time zone DEFAULT now(),
  "stripe_subscription_id" text,
  "stripe_price_id"        text,
  CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "subscriptions_organization_id_key" UNIQUE (organization_id),
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id),
  CONSTRAINT "subscriptions_stripe_subscription_id_key" UNIQUE (stripe_subscription_id)
);

ALTER TABLE "public"."subscriptions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_subscriptions_org ON public.subscriptions USING btree (organization_id);

CREATE INDEX idx_subscriptions_period_end ON public.subscriptions USING btree (current_period_end);

CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);

CREATE INDEX idx_subscriptions_stripe_sub ON public.subscriptions USING btree (stripe_subscription_id);

CREATE POLICY "Users can insert own organization subscription" ON "public"."subscriptions"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can update own organization subscription" ON "public"."subscriptions"
  FOR UPDATE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can view own organization subscription" ON "public"."subscriptions"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."subscriptions" TO "anon", "authenticated", "postgres", "service_role";
