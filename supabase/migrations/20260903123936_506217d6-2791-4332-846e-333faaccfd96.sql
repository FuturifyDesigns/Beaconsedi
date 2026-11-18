CREATE OR REPLACE FUNCTION public.incident_response_view(_alert_id uuid)
RETURNS TABLE (
  incident_status text,
  incident_lat double precision,
  incident_lng double precision,
  unit_id uuid,
  call_sign text,
  kind text,
  unit_status text,
  latitude double precision,
  longitude double precision,
  heading double precision,
  speed double precision,
  accuracy double precision,
  last_location_update timestamptz,
  eta_minutes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.status, a.latitude, a.longitude,
         u.id, u.call_sign, u.kind, u.status,
         u.latitude, u.longitude, u.heading, u.speed, u.accuracy,
         u.last_location_update, COALESCE(u.eta_minutes, a.eta_minutes)
  FROM public.alerts a
  LEFT JOIN public.responder_units u ON u.id = a.assigned_unit_id
  WHERE a.id = _alert_id
$$;

REVOKE ALL ON FUNCTION public.incident_response_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.incident_response_view(uuid) TO anon, authenticated;