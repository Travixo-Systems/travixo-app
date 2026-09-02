CREATE TABLE "public"."team_invitations" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" uuid                     NOT NULL,
  "email"           character varying(255)   NOT NULL,
  "role"            character varying(50)    NOT NULL DEFAULT 'member'::character varying,
  "token"           character varying(255)   NOT NULL,
  "invited_by"      uuid                     NOT NULL,
  "status"          character varying(50)    NOT NULL DEFAULT 'pending'::character varying,
  "expires_at"      timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "accepted_at"     timestamp with time zone,
  CONSTRAINT "team_invitations_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "team_invitations_pkey" PRIMARY KEY (id),
  CONSTRAINT "team_invitations_token_key" UNIQUE (token),
  CONSTRAINT "team_invitations_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES public.users(id)
);

ALTER TABLE "public"."team_invitations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_team_invitations_email ON public.team_invitations USING btree (email);

CREATE INDEX idx_team_invitations_org ON public.team_invitations USING btree (organization_id);

CREATE INDEX idx_team_invitations_status ON public.team_invitations USING btree (status);

CREATE INDEX idx_team_invitations_token ON public.team_invitations USING btree (token);

CREATE POLICY "Admins can create invitations" ON "public"."team_invitations"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying])::text[]))))));

CREATE POLICY "Admins can update invitations" ON "public"."team_invitations"
  FOR UPDATE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.role)::text = ANY ((ARRAY['owner'::character varying, 'admin'::character varying])::text[]))))));

CREATE POLICY "Users can view their org invitations" ON "public"."team_invitations"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."team_invitations" TO "anon", "authenticated", "postgres", "service_role";
