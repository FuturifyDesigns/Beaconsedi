CREATE SEQUENCE IF NOT EXISTS public.referral_ref_seq START 1;

CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT ('BSR-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.referral_ref_seq')::text, 5, '0')),
  from_facility_id uuid NOT NULL REFERENCES public.hospitals(id),
  to_facility_id uuid NOT NULL REFERENCES public.hospitals(id),
  patient_ref text NOT NULL,
  patient_condition text,
  priority text NOT NULL DEFAULT 'routine',
  clinical_notes text,
  ambulance_type text,
  referring_doctor text,
  contact_person text,
  contact_phone text,
  provider text,
  unit_id uuid REFERENCES public.responder_units(id),
  driver_name text,
  driver_phone text,
  crew text,
  status text NOT NULL DEFAULT 'pending',
  decision_note text,
  accepted_at timestamptz,
  departed_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  total_distance_km double precision,
  route_polyline text,
  eta_minutes integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
GRANT USAGE ON SEQUENCE public.referral_ref_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.referral_ref_seq TO service_role;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read referrals" ON public.referrals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') OR public.has_role(auth.uid(), 'hospital') OR public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'crew'));
CREATE POLICY "Hospitals operators and admins create referrals" ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') OR public.has_role(auth.uid(), 'hospital'));
CREATE POLICY "Hospitals operators and admins update referrals" ON public.referrals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') OR public.has_role(auth.uid(), 'hospital'));
CREATE POLICY "Admins delete referrals" ON public.referrals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.referral_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.referral_status_history TO authenticated;
GRANT ALL ON public.referral_status_history TO service_role;

ALTER TABLE public.referral_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read referral history" ON public.referral_status_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') OR public.has_role(auth.uid(), 'hospital') OR public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'crew'));
CREATE POLICY "Staff write referral history" ON public.referral_status_history FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') OR public.has_role(auth.uid(), 'hospital') OR public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'crew'));

CREATE TABLE public.referral_handover (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  received_by text NOT NULL,
  notes text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.referral_handover TO authenticated;
GRANT ALL ON public.referral_handover TO service_role;

ALTER TABLE public.referral_handover ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read handovers" ON public.referral_handover FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') OR public.has_role(auth.uid(), 'hospital') OR public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'crew'));
CREATE POLICY "Receiving staff record handovers" ON public.referral_handover FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operator') OR public.has_role(auth.uid(), 'hospital'));

CREATE TRIGGER referrals_updated_at BEFORE UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();