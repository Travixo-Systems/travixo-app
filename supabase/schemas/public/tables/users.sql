CREATE TABLE "public"."users" (
  "id"              uuid                     NOT NULL,
  "email"           character varying(255)   NOT NULL,
  "full_name"       character varying(255),
  "organization_id" uuid,
  "role"            character varying(50)    DEFAULT 'member'::character varying,
  "created_at"      timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "updated_at"      timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "first_name"      text,
  "last_name"       text,
  "avatar_url"      text,
  "language"        text                     DEFAULT 'fr'::text,
  CONSTRAINT "users_email_key" UNIQUE (email),
  CONSTRAINT "users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT "users_language_check" CHECK ((language = ANY (ARRAY['fr'::text, 'en'::text]))),
  CONSTRAINT "users_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "users_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."users"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_users_language ON public.users USING btree (LANGUAGE);

CREATE INDEX idx_users_organization ON public.users USING btree (organization_id);

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins can update team member roles" ON "public"."users"
  FOR UPDATE
  TO PUBLIC
  USING (((organization_id = public.get_my_organization_id()) AND (EXISTS ( SELECT 1
   FROM public.users me
  WHERE
    ((me.id = auth.uid()) AND (me.organization_id = users.organization_id) AND ((me.role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character
    varying])::text[])))))))
  WITH
    CHECK
    (((organization_id = public.get_my_organization_id()) AND ((role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying, 'member'::character varying,
    'viewer'::character varying])::text[]))));

CREATE POLICY "Users can insert own profile" ON "public"."users"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can update own profile" ON "public"."users"
  FOR UPDATE
  TO PUBLIC
  USING ((id = auth.uid()))
  WITH
    CHECK
    (((id = auth.uid()) AND ((role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying, 'member'::character varying, 'viewer'::character
    varying])::text[]))));

CREATE POLICY "Users can view own profile" ON "public"."users"
  FOR SELECT
  TO "authenticated"
  USING ((auth.uid() = id));

CREATE POLICY "super_admin_read_all_users" ON "public"."users"
  FOR SELECT
  TO PUBLIC
  USING (public.is_super_admin());

CREATE POLICY "users_insert_during_signup" ON "public"."users"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (true);

CREATE POLICY "users_select_same_org" ON "public"."users"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id = public.get_my_organization_id()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "anon", "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."users"."avatar_url" IS 'URL to user profile photo (UploadThing)';

COMMENT ON COLUMN "public"."users"."first_name" IS 'User first name';

COMMENT ON COLUMN "public"."users"."language" IS 'User preferred language (fr or en)';

COMMENT ON COLUMN "public"."users"."last_name" IS 'User last name';

COMMENT ON COLUMN "public"."users"."updated_at" IS 'Timestamp of last profile update';

COMMENT ON POLICY "Users can insert own profile" ON "public"."users" IS 'Allow user creation during signup process';

COMMENT ON POLICY "Users can view own profile" ON "public"."users" IS 'Users can only read their own profile data';
