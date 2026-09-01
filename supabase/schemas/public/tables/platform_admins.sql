CREATE TABLE "public"."platform_admins" (
  "user_id"    uuid                     NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "platform_admins_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "platform_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."platform_admins"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_read_self_admins" ON "public"."platform_admins"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."platform_admins" TO "anon", "authenticated", "postgres", "service_role";
