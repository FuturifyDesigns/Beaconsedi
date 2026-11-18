ALTER TABLE public.responder_units
  ADD COLUMN IF NOT EXISTS heading double precision,
  ADD COLUMN IF NOT EXISTS speed double precision,
  ADD COLUMN IF NOT EXISTS accuracy double precision,
  ADD COLUMN IF NOT EXISTS last_location_update timestamptz;

CREATE TABLE IF NOT EXISTS public.responder_locations (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.responder_units(id) on delete cascade,
  responder_id uuid references auth.users(id) on delete set null,
  incident_id uuid references public.alerts(id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  heading double precision,
  speed double precision,
  accuracy double precision,
  status text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  CONSTRAINT responder_locations_coords_valid CHECK (
    latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
  )
);

GRANT SELECT, INSERT ON public.responder_locations TO authenticated;
GRANT ALL ON public.responder_locations TO service_role;

ALTER TABLE public.responder_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read responder locations" ON public.responder_locations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Responders record own locations" ON public.responder_locations
  FOR INSERT TO authenticated
  WITH CHECK (responder_id = auth.uid() AND (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'admin')));

CREATE INDEX IF NOT EXISTS responder_locations_unit_time_idx ON public.responder_locations (unit_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS responder_locations_incident_time_idx ON public.responder_locations (incident_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION public.sync_unit_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.unit_id IS NOT NULL THEN
    UPDATE public.responder_units
      SET latitude = NEW.latitude,
          longitude = NEW.longitude,
          heading = NEW.heading,
          speed = NEW.speed,
          accuracy = NEW.accuracy,
          last_location_update = NEW.recorded_at,
          updated_at = now()
    WHERE id = NEW.unit_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_unit_location ON public.responder_locations;
CREATE TRIGGER trg_sync_unit_location
AFTER INSERT ON public.responder_locations
FOR EACH ROW EXECUTE FUNCTION public.sync_unit_location();

ALTER PUBLICATION supabase_realtime ADD TABLE public.responder_locations;