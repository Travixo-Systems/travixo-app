CREATE TABLE "public"."subscription_plans" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"                 text                     NOT NULL,
  "slug"                 text                     NOT NULL,
  "description"          text,
  "price_monthly"        numeric(10,2)            NOT NULL,
  "price_yearly"         numeric(10,2),
  "max_assets"           integer                  NOT NULL,
  "max_users"            integer                  NOT NULL,
  "features"             jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "is_active"            boolean                  DEFAULT true,
  "display_order"        integer                  DEFAULT 0,
  "created_at"           timestamp with time zone DEFAULT now(),
  "updated_at"           timestamp with time zone DEFAULT now(),
  "stripe_price_monthly" text,
  "stripe_price_annual"  text,
  CONSTRAINT "subscription_plans_name_key" UNIQUE (name),
  CONSTRAINT "subscription_plans_pkey" PRIMARY KEY (id),
  CONSTRAINT "subscription_plans_slug_key" UNIQUE (slug)
);

ALTER TABLE "public"."subscription_plans"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view subscription plans" ON "public"."subscription_plans"
  FOR SELECT
  TO PUBLIC
  USING ((is_active = true));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."subscription_plans" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."subscription_plans"."max_assets" IS 'SENTINEL on the travixo row (int4 max), not a limit. Licensed capacity is per-subscription (subscriptions.licensed_capacity), because two customers on the same plan license different amounts. Retired tier rows keep their original values.';
