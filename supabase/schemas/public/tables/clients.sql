CREATE TABLE "public"."clients" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid                     NOT NULL,
  "name"            text                     NOT NULL,
  "email"           text,
  "phone"           text,
  "company"         text,
  "address"         text,
  "notes"           text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "clients_pkey" PRIMARY KEY (id),
  CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);

ALTER TABLE "public"."clients"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_clients_email ON public.clients USING btree (organization_id, email)
  WHERE (email IS NOT NULL);

CREATE UNIQUE INDEX idx_clients_org_name ON public.clients USING btree (organization_id, lower(name));

CREATE INDEX idx_clients_org ON public.clients USING btree (organization_id);

CREATE POLICY "Users can insert own org clients" ON "public"."clients"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can update own org clients" ON "public"."clients"
  FOR UPDATE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can view own org clients" ON "public"."clients"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."clients" TO "anon", "authenticated", "postgres", "service_role";
