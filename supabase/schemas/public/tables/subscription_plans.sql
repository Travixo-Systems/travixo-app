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
