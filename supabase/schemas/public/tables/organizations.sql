CREATE TABLE "public"."organizations" (
  "id"                       uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "name"                     character varying(255)   NOT NULL,
  "slug"                     character varying(255)   NOT NULL,
  "created_at"               timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "updated_at"               timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "subscription_tier"        character varying(50)    DEFAULT 'trial'::character varying,
  "trial_ends_at"            timestamp with time zone,
  "is_pilot"                 boolean                  DEFAULT false,
  "pilot_start_date"         timestamp with time zone,
  "pilot_end_date"           timestamp with time zone,
  "subscription_status"      text                     DEFAULT 'trial'::text,
  "siret"                    character varying(14),
  "address"                  text,
  "city"                     character varying(100),
  "postal_code"              character varying(10),
  "logo_url"                 text,
  "website"                  text,
  "phone"                    text,
  "country"                  text                     DEFAULT 'FR'::text,
  "timezone"                 text                     DEFAULT 'Europe/Paris'::text,
  "currency"                 text                     DEFAULT 'EUR'::text,
  "industry_sector"          text,
  "company_size"             text,
  "branding_colors"          jsonb                    DEFAULT
    '{"accent": "#d97706", "danger": "#b91c1c", "primary": "#1e3a5f", "success": "#047857", "warning": "#eab308", "secondary": "#2d5a7b"}'::jsonb,
  "notification_preferences" jsonb                    DEFAULT
    '{"vgp_alerts": {"timing": [30, 15, 7, 1], "enabled": true, "recipients": ["owner"]}, "digest_mode": "daily", "asset_alerts": true, "audit_alerts": true, "email_enabled": true}'::jsonb,
  "vgp_alerts_enabled"       boolean                  DEFAULT true,
  "vgp_alert_days"           integer[]                DEFAULT '{30,7,1,0}'::integer[],
  "stripe_customer_id"       text,
  "pilot_notes"              text,
  "converted_to_paid"        boolean                  DEFAULT false,
  "onboarding_completed"     boolean                  DEFAULT false,
  "demo_data_seeded"         boolean                  DEFAULT false,
  "feature_flags"            jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "organizations_pkey" PRIMARY KEY (id),
  CONSTRAINT "organizations_slug_key" UNIQUE (slug),
  CONSTRAINT "organizations_stripe_customer_id_key" UNIQUE (stripe_customer_id)
);

ALTER TABLE "public"."organizations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_organizations_stripe_customer ON public.organizations USING btree (stripe_customer_id);

CREATE TRIGGER auto_create_trial_subscription
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.create_trial_subscription();

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Authenticated users can create organizations" ON "public"."organizations"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((auth.role() = 'authenticated'::text));

CREATE POLICY "Owners and admins can update organization" ON "public"."organizations"
  FOR UPDATE
  TO PUBLIC
  USING ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying])::text[]))))))
  WITH CHECK ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying])::text[]))))));

CREATE POLICY "Users can update own organization" ON "public"."organizations"
  FOR UPDATE
  TO PUBLIC
  USING ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can view own organization" ON "public"."organizations"
  FOR SELECT
  TO PUBLIC
  USING ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "org_insert_during_signup" ON "public"."organizations"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (true);

CREATE POLICY "org_select_own" ON "public"."organizations"
  FOR SELECT
  TO PUBLIC
  USING ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "org_update_own" ON "public"."organizations"
  FOR UPDATE
  TO PUBLIC
  USING ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))))
  WITH CHECK ((id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "super_admin_all_access" ON "public"."organizations"
  FOR ALL
  TO PUBLIC
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."organizations" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."organizations"."vgp_alert_days" IS 'Array of day values for enabled alert types. 30=30-day reminder, 7=7-day, 1=1-day, 0=overdue';

COMMENT ON COLUMN "public"."organizations"."vgp_alerts_enabled" IS 'Whether VGP email alerts are enabled for this organization';
