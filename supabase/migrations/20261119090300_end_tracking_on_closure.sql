CREATE OR REPLACE FUNCTION public.update_sos_location(
  _alert_id uuid, _latitude double precision, _longitude double precision,
  _accuracy double precision DEFAULT NULL, _heading double precision DEFAULT NULL,
  _speed double precision DEFAULT NULL, _address text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE incident_status text; owner_id uuid;
BEGIN
  SELECT status, patient_id INTO incident_status, owner_id
  FROM public.alerts WHERE id = _alert_id FOR UPDATE;
  IF NOT FOUND OR (owner_id IS NOT NULL AND owner_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Location sharing is unavailable for this incident';
  END IF;
  -- A final in-flight GPS request can arrive after the dispatcher closes the case.
  IF incident_status IN ('resolved', 'cancelled') THEN RETURN; END IF;
  UPDATE public.alerts SET
    latitude = _latitude, longitude = _longitude, accuracy = _accuracy,
    heading = _heading, speed = _speed, location_source = 'gps',
    location_updated_at = now(), address = COALESCE(left(_address, 1000), address)
  WHERE id = _alert_id;
END $$;

CREATE OR REPLACE FUNCTION public.incident_response_view(_alert_id uuid)
RETURNS TABLE (
  incident_status text, incident_lat double precision, incident_lng double precision,
  unit_id uuid, call_sign text, kind text, unit_status text,
  latitude double precision, longitude double precision, heading double precision,
  speed double precision, accuracy double precision, last_location_update timestamptz,
  eta_minutes integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.status, a.latitude, a.longitude,
         u.id, u.call_sign, u.kind, u.status,
         u.latitude, u.longitude, u.heading, u.speed, u.accuracy,
         u.last_location_update, COALESCE(u.eta_minutes, a.eta_minutes)
  FROM public.alerts a
  LEFT JOIN public.responder_units u
    ON u.id = a.assigned_unit_id AND a.status NOT IN ('resolved', 'cancelled')
  WHERE a.id = _alert_id;
$$;
