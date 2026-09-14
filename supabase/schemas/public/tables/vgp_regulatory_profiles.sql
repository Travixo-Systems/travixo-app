CREATE TABLE "public"."vgp_regulatory_profiles" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"                    text                     NOT NULL,
  "category"                text,
  "default_interval_months" integer                  NOT NULL,
  "regulatory_reference"    text,
  "description"             text,
  "created_at"              timestamp with time zone DEFAULT now(),
  "code"                    text                     NOT NULL,
  "usage_condition"         text,
  "classification_status"   text                     NOT NULL DEFAULT 'requires_confirmation'::text,
  "source_url"              text,
  "source_checked_at"       timestamp with time zone,
  "effective_from"          date,
  "effective_to"            date,
  "active"                  boolean                  NOT NULL DEFAULT true,
  CONSTRAINT "vgp_regulatory_profiles_classification_status_check"
    CHECK ((classification_status = ANY (ARRAY['automatic'::text, 'requires_confirmation'::text, 'manual_only'::text]))),
  CONSTRAINT "vgp_regulatory_profiles_code_key" UNIQUE (code),
  CONSTRAINT "vgp_regulatory_profiles_effective_range_check" CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to >= effective_from))),
  CONSTRAINT "vgp_regulatory_profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."vgp_regulatory_profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_vgp_regulatory_profiles_active ON public.vgp_regulatory_profiles USING btree (active, name)
  WHERE (active = true);

CREATE POLICY "Signed-in users can read the regulatory catalogue" ON "public"."vgp_regulatory_profiles"
  FOR SELECT
  TO "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vgp_regulatory_profiles" TO "postgres", "service_role";

COMMENT ON COLUMN "public"."vgp_regulatory_profiles"."category" IS 'LEGACY from vgp_equipment_types. Nullable, never written again. There is deliberately no relationship to asset_categories.';

COMMENT ON COLUMN "public"."vgp_regulatory_profiles"."classification_status" IS 'automatic = prefill the interval; requires_confirmation = prefill but force an explicit confirmation; manual_only = no prefill, the configuration picks the regime.';

COMMENT ON COLUMN "public"."vgp_regulatory_profiles"."default_interval_months" IS 'Default/maximum statutory interval for the identified case. Conditions may require more frequent verification, and the Labour Inspectorate may impose a shorter one -- so this is a proposal, never a guarantee.';

COMMENT ON TABLE "public"."vgp_regulatory_profiles" IS 'Global catalogue of French VGP regulatory profiles. Selected by the user at schedule create/edit -- never derived from an asset category, because the fitted configuration determines the applicable regime. Writes are service_role only.';

REVOKE ALL ON TABLE "public"."vgp_regulatory_profiles" FROM "authenticated";

GRANT SELECT ON TABLE "public"."vgp_regulatory_profiles" TO "authenticated";
