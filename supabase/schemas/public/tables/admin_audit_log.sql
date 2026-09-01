CREATE TABLE "public"."admin_audit_log" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "actor_id"       uuid,
  "action"         text                     NOT NULL,
  "target_org_id"  uuid,
  "target_user_id" uuid,
  "before"         jsonb,
  "after"          jsonb,
  "created_at"     timestamp with time zone DEFAULT now(),
  CONSTRAINT "admin_audit_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id),
  CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."admin_audit_log"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_audit_log" ON "public"."admin_audit_log"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admin_audit_log" TO "anon", "authenticated", "postgres", "service_role";
