-- The incident UUID is the existing guest tracking capability.
CREATE FUNCTION public.update_sos_location(
  _alert_id uuid, _latitude double precision, _longitude double precision,
  _accuracy double precision DEFAULT NULL, _heading double precision DEFAULT NULL,
  _speed double precision DEFAULT NULL, _address text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.alerts SET
    latitude = _latitude, longitude = _longitude, accuracy = _accuracy,
    heading = _heading, speed = _speed, location_source = 'gps',
    location_updated_at = now(), address = COALESCE(left(_address, 1000), address)
  WHERE id = _alert_id AND status NOT IN ('resolved', 'cancelled')
    AND (patient_id IS NULL OR patient_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Location sharing is unavailable for this incident'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.update_sos_location(uuid, double precision, double precision, double precision, double precision, double precision, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_sos_location(uuid, double precision, double precision, double precision, double precision, double precision, text) TO anon, authenticated;
