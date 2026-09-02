CREATE TABLE "public"."rentals" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"      uuid                     NOT NULL,
  "asset_id"             uuid                     NOT NULL,
  "client_name"          text                     NOT NULL,
  "client_contact"       text,
  "checked_out_by"       uuid                     NOT NULL,
  "returned_by"          uuid,
  "checkout_date"        timestamp with time zone NOT NULL DEFAULT now(),
  "expected_return_date" timestamp with time zone,
  "actual_return_date"   timestamp with time zone,
  "checkout_notes"       text,
  "return_notes"         text,
  "return_condition"     text,
  "status"               text                     NOT NULL DEFAULT 'active'::text,
  "checkout_scan_id"     uuid,
  "return_scan_id"       uuid,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "client_id"            uuid,
  CONSTRAINT "rentals_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES public.assets(id),
  CONSTRAINT "rentals_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT "rentals_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT "rentals_pkey" PRIMARY KEY (id),
  CONSTRAINT "rentals_return_condition_check" CHECK (((return_condition IS NULL) OR (return_condition = ANY (ARRAY['good'::text, 'fair'::text, 'damaged'::text])))),
  CONSTRAINT "rentals_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'returned'::text, 'cancelled'::text]))),
  CONSTRAINT "rentals_checkout_scan_id_fkey" FOREIGN KEY (checkout_scan_id) REFERENCES public.scans(id),
  CONSTRAINT "rentals_return_scan_id_fkey" FOREIGN KEY (return_scan_id) REFERENCES public.scans(id),
  CONSTRAINT "rentals_checked_out_by_fkey" FOREIGN KEY (checked_out_by) REFERENCES public.users(id),
  CONSTRAINT "rentals_returned_by_fkey" FOREIGN KEY (returned_by) REFERENCES public.users(id)
);

ALTER TABLE "public"."rentals"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_rentals_active ON public.rentals USING btree (organization_id, status)
  WHERE (status = 'active'::text);

CREATE INDEX idx_rentals_asset ON public.rentals USING btree (asset_id);

CREATE INDEX idx_rentals_checkout_date ON public.rentals USING btree (checkout_date DESC);

CREATE INDEX idx_rentals_client_id ON public.rentals USING btree (client_id)
  WHERE (client_id IS NOT NULL);

CREATE INDEX idx_rentals_client ON public.rentals USING btree (organization_id, client_name);

CREATE INDEX idx_rentals_org ON public.rentals USING btree (organization_id);

CREATE POLICY "Users can insert own org rentals" ON "public"."rentals"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can update own org rentals" ON "public"."rentals"
  FOR UPDATE
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

CREATE POLICY "Users can view own org rentals" ON "public"."rentals"
  FOR SELECT
  TO PUBLIC
  USING ((organization_id IN ( SELECT users.organization_id
   FROM public.users
  WHERE (users.id = auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."rentals" TO "anon", "authenticated", "postgres", "service_role";
