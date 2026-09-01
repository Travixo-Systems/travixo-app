CREATE TABLE "public"."vgp_equipment_types" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"                    text                     NOT NULL,
  "category"                text                     NOT NULL,
  "default_interval_months" integer                  NOT NULL,
  "regulatory_reference"    text,
  "description"             text,
  "created_at"              timestamp with time zone DEFAULT now(),
  CONSTRAINT "vgp_equipment_types_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."vgp_equipment_types"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view equipment types" ON "public"."vgp_equipment_types"
  FOR SELECT
  TO PUBLIC
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."vgp_equipment_types" TO "anon", "authenticated", "postgres", "service_role";
