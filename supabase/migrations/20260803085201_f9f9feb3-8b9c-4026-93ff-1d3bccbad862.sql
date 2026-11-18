-- patient profile extras
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS medical_notes text,
  ADD COLUMN IF NOT EXISTS special_needs text;

-- vehicle detail on existing units
ALTER TABLE public.responder_units
  ADD COLUMN IF NOT EXISTS vehicle_number text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS fuel_level integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS mileage_km integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_inspection date,
  ADD COLUMN IF NOT EXISTS equipment_status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS image_url text;

-- responder profiles
CREATE TABLE IF NOT EXISTS public.responder_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  national_id text,
  employee_number text,
  responder_code text,
  photo_url text,
  gender text,
  date_of_birth date,
  phone text,
  email text,
  home_station text,
  department text,
  license_number text,
  license_expiry date,
  certification_level text NOT NULL DEFAULT 'emt_basic',
  organization text,
  rank text,
  years_of_service integer NOT NULL DEFAULT 0,
  assigned_unit_id uuid REFERENCES public.responder_units(id) ON DELETE SET NULL,
  availability text NOT NULL DEFAULT 'offline',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.responder_profiles TO authenticated;
GRANT ALL ON public.responder_profiles TO service_role;
ALTER TABLE public.responder_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read responder profiles" ON public.responder_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'responder') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Own responder profile insert" ON public.responder_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Own responder profile update" ON public.responder_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete responder profiles" ON public.responder_profiles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER responder_profiles_updated_at BEFORE UPDATE ON public.responder_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- shifts
CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.responder_units(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  break_started_at timestamptz,
  break_seconds integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'on_duty',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read shifts" ON public.shifts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'responder') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Own shift insert" ON public.shifts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own shift update" ON public.shifts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER shifts_updated_at BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.shift_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.shift_events TO authenticated;
GRANT ALL ON public.shift_events TO service_role;
ALTER TABLE public.shift_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read shift events" ON public.shift_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'responder') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Own shift events insert" ON public.shift_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text,
  severity text NOT NULL DEFAULT 'info',
  alert_id uuid REFERENCES public.alerts(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own notifications read" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Staff notifications insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'responder') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Own notifications update" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own notifications delete" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;