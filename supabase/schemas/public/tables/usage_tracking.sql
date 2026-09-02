CREATE TABLE "public"."usage_tracking" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"  uuid                     NOT NULL,
  "period_start"     timestamp with time zone NOT NULL,
  "period_end"       timestamp with time zone NOT NULL,
  "asset_count"      integer                  DEFAULT 0,
  "user_count"       integer                  DEFAULT 0,
  "scan_count"       integer                  DEFAULT 0,
  "inspection_count" integer                  DEFAULT 0,
  "created_at"       timestamp with time zone DEFAULT now(),
  CONSTRAINT "usage_tracking_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "usage_tracking_organization_id_period_start_key" UNIQUE (organization_id, period_start),
  CONSTRAINT "usage_tracking_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."usage_tracking"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_usage_tracking_org ON public.usage_tracking USING btree (organization_id);

CREATE POLICY "usage_tracking_select_own_org" ON "public"."usage_tracking"
  FOR SELECT
  TO "authenticated"
  USING ((organization_id = ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."usage_tracking" TO "anon", "authenticated", "postgres", "service_role";
