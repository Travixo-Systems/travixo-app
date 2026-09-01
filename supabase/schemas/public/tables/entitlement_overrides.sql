CREATE TABLE "public"."entitlement_overrides" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid                     NOT NULL,
  "feature"         text                     NOT NULL,
  "granted"         boolean                  NOT NULL DEFAULT true,
  "reason"          text,
  "granted_by"      uuid,
  "expires_at"      timestamp with time zone,
  "created_at"      timestamp with time zone DEFAULT now(),
  CONSTRAINT "entitlement_overrides_organization_id_feature_key" UNIQUE (organization_id, feature),
  CONSTRAINT "entitlement_overrides_pkey" PRIMARY KEY (id),
  CONSTRAINT "entitlement_overrides_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "entitlement_overrides_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES public.users(id)
);

ALTER TABLE "public"."entitlement_overrides"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_entitlement_overrides_org ON public.entitlement_overrides USING btree (organization_id);

CREATE POLICY "Users can view own org entitlements" ON "public"."entitlement_overrides"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."entitlement_overrides" TO "anon", "authenticated", "postgres", "service_role";
