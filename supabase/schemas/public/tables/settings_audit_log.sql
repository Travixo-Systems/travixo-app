CREATE TABLE "public"."settings_audit_log" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"  uuid                     NOT NULL,
  "user_id"          uuid                     NOT NULL,
  "setting_category" text                     NOT NULL,
  "action"           text                     NOT NULL,
  "old_value"        jsonb,
  "new_value"        jsonb,
  "created_at"       timestamp with time zone DEFAULT now(),
  CONSTRAINT "settings_audit_log_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "settings_audit_log_pkey" PRIMARY KEY (id),
  CONSTRAINT "settings_audit_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE "public"."settings_audit_log"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_settings_audit_log_org ON public.settings_audit_log USING btree (organization_id, created_at DESC);

CREATE POLICY "System can insert audit logs" ON "public"."settings_audit_log"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (true);

CREATE POLICY "Users can view organization audit logs" ON "public"."settings_audit_log"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."settings_audit_log" TO "anon", "authenticated", "postgres", "service_role";
