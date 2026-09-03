CREATE TABLE "public"."user_notification_preferences" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         uuid                     NOT NULL,
  "organization_id" uuid                     NOT NULL,
  "vgp_frequency"   text                     NOT NULL DEFAULT 'daily_digest'::text,
  "vgp_thresholds"  integer[]                NOT NULL DEFAULT '{30,15,7,1,0}'::integer[],
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_notification_preferences_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY (id),
  CONSTRAINT "user_notification_preferences_user_org_key" UNIQUE (user_id, organization_id),
  CONSTRAINT "user_notification_preferences_vgp_frequency_check" CHECK ((vgp_frequency = ANY (ARRAY['immediate'::text, 'daily_digest'::text, 'weekly_digest'::text, 'off'::text]))),
  CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."user_notification_preferences"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_user_notif_prefs_active ON public.user_notification_preferences USING btree (organization_id, vgp_frequency)
  WHERE (vgp_frequency <> 'off'::text);

CREATE INDEX idx_user_notif_prefs_org ON public.user_notification_preferences USING btree (organization_id);

CREATE TRIGGER update_user_notif_prefs_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "user_notif_prefs_insert_own" ON "public"."user_notification_preferences"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.id = auth.uid()) AND (u.organization_id = user_notification_preferences.organization_id))))));

CREATE POLICY "user_notif_prefs_select_own" ON "public"."user_notification_preferences"
  FOR SELECT
  TO PUBLIC
  USING ((user_id = auth.uid()));

CREATE POLICY "user_notif_prefs_update_own" ON "public"."user_notification_preferences"
  FOR UPDATE
  TO PUBLIC
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."user_notification_preferences" TO "authenticated", "postgres", "service_role";

COMMENT ON COLUMN "public"."user_notification_preferences"."vgp_thresholds" IS 'FREQUENCY_RULES.preferenceDay values, not day counts: 30/15/7/1/0 identify the planning/attention/urgent/critical/overdue bands respectively.';

COMMENT ON TABLE "public"."user_notification_preferences" IS 'Per-user VGP alert delivery preferences. Overrides organizations.notification_preferences, which remains the default when no row exists.';
