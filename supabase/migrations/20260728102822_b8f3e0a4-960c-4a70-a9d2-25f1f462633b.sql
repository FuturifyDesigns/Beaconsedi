-- === alerts: triage fields ===
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'high',
  ADD COLUMN IF NOT EXISTS incident_type text NOT NULL DEFAULT 'medical',
  ADD COLUMN IF NOT EXISTS assigned_unit_id uuid,
  ADD COLUMN IF NOT EXISTS eta_minutes integer,
  ADD COLUMN IF NOT EXISTS incident_code text;

CREATE OR REPLACE FUNCTION public.set_incident_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.incident_code IS NULL THEN
    NEW.incident_code := 'BCN-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(NEW.id::text,'-',''), 1, 4));
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_alerts_incident_code ON public.alerts;
CREATE TRIGGER trg_alerts_incident_code BEFORE INSERT ON public.alerts
FOR EACH ROW EXECUTE FUNCTION public.set_incident_code();

UPDATE public.alerts SET incident_code = 'BCN-' || to_char(created_at, 'YYMMDD') || '-' || upper(substr(replace(id::text,'-',''),1,4))
WHERE incident_code IS NULL;

-- === responder_units ===
CREATE TABLE IF NOT EXISTS public.responder_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'ambulance',
  call_sign text NOT NULL,
  vehicle text,
  status text NOT NULL DEFAULT 'available',
  latitude double precision,
  longitude double precision,
  current_alert_id uuid REFERENCES public.alerts(id) ON DELETE SET NULL,
  eta_minutes integer,
  user_id uuid,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.responder_units TO authenticated;
GRANT ALL ON public.responder_units TO service_role;
ALTER TABLE public.responder_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read units" ON public.responder_units FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'responder') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Staff update units" ON public.responder_units FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'responder') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'responder') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins insert units" ON public.responder_units FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete units" ON public.responder_units FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS trg_units_updated ON public.responder_units;
CREATE TRIGGER trg_units_updated BEFORE UPDATE ON public.responder_units
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- === hospitals ===
CREATE TABLE IF NOT EXISTS public.hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  phone text,
  trauma_beds_total integer NOT NULL DEFAULT 0,
  trauma_beds_available integer NOT NULL DEFAULT 0,
  icu_total integer NOT NULL DEFAULT 0,
  icu_available integer NOT NULL DEFAULT 0,
  theatres_total integer NOT NULL DEFAULT 0,
  theatres_available integer NOT NULL DEFAULT 0,
  ambulance_bays_total integer NOT NULL DEFAULT 0,
  ambulance_bays_available integer NOT NULL DEFAULT 0,
  diversion_status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hospitals TO authenticated;
GRANT ALL ON public.hospitals TO service_role;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read hospitals" ON public.hospitals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'responder') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Staff update hospitals" ON public.hospitals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'responder') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'responder') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins insert hospitals" ON public.hospitals FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete hospitals" ON public.hospitals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS trg_hospitals_updated ON public.hospitals;
CREATE TRIGGER trg_hospitals_updated BEFORE UPDATE ON public.hospitals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- === incident_events ===
CREATE TABLE IF NOT EXISTS public.incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  note text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incident_events_alert ON public.incident_events(alert_id, created_at DESC);

GRANT SELECT, INSERT ON public.incident_events TO authenticated;
GRANT ALL ON public.incident_events TO service_role;
ALTER TABLE public.incident_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read incident events" ON public.incident_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'responder') OR public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.alerts a WHERE a.id = alert_id AND a.patient_id = auth.uid())
  );
CREATE POLICY "Insert incident events" ON public.incident_events FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

-- === audit_logs ===
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Authenticated write audit" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- === realtime ===
ALTER TABLE public.responder_units REPLICA IDENTITY FULL;
ALTER TABLE public.hospitals REPLICA IDENTITY FULL;
ALTER TABLE public.incident_events REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.responder_units;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.hospitals;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_events;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- === seed demo fleet + hospitals ===
INSERT INTO public.hospitals (name, latitude, longitude, phone, trauma_beds_total, trauma_beds_available, icu_total, icu_available, theatres_total, theatres_available, ambulance_bays_total, ambulance_bays_available, diversion_status) VALUES
  ('Central Trauma Centre', -1.28638, 36.81722, '+254700000101', 24, 7, 18, 3, 8, 2, 10, 6, 'open'),
  ('St. Mary General Hospital', -1.30190, 36.79150, '+254700000102', 16, 2, 12, 1, 5, 1, 8, 3, 'limited'),
  ('Riverside Emergency Hospital', -1.26520, 36.84210, '+254700000103', 12, 0, 9, 0, 4, 0, 6, 1, 'diverting'),
  ('Northgate Medical Centre', -1.24010, 36.80540, '+254700000104', 20, 11, 14, 6, 6, 3, 9, 7, 'open');

INSERT INTO public.responder_units (name, kind, call_sign, vehicle, status, latitude, longitude, phone) VALUES
  ('Alpha Medic Crew', 'ambulance', 'AMB-01', 'Mercedes Sprinter ALS', 'available', -1.28900, 36.82100, '+254700000201'),
  ('Bravo Medic Crew', 'ambulance', 'AMB-02', 'Toyota HiAce BLS', 'en_route', -1.29800, 36.79900, '+254700000202'),
  ('Charlie Medic Crew', 'ambulance', 'AMB-03', 'Ford Transit ALS', 'on_scene', -1.27200, 36.83500, '+254700000203'),
  ('Patrol Unit 7', 'police', 'POL-07', 'Land Cruiser Patrol', 'available', -1.28300, 36.80800, '+254700000204'),
  ('Patrol Unit 12', 'police', 'POL-12', 'Isuzu Patrol', 'busy', -1.30500, 36.82600, '+254700000205'),
  ('Fire Rescue 3', 'fire', 'FIRE-03', 'Rosenbauer Pumper', 'available', -1.26900, 36.81100, '+254700000206'),
  ('Heavy Rescue 1', 'rescue', 'RSC-01', 'Extrication Rig', 'available', -1.29400, 36.84700, '+254700000207'),
  ('Air Ambulance Kilo', 'air', 'AIR-K1', 'AW139 HEMS', 'offline', -1.31900, 36.92700, '+254700000208');