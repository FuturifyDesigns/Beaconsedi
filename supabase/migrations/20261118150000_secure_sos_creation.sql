-- Guests and signed-in patients share a narrow SOS submission path.
CREATE FUNCTION public.submit_sos_alert(
  _latitude double precision,
  _longitude double precision,
  _accuracy double precision DEFAULT NULL,
  _heading double precision DEFAULT NULL,
  _speed double precision DEFAULT NULL,
  _patient_name text DEFAULT NULL,
  _patient_phone text DEFAULT NULL,
  _message text DEFAULT NULL
)
RETURNS TABLE(id uuid, status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.alerts AS alert (
    patient_id, patient_name, patient_phone, latitude, longitude, accuracy,
    heading, speed, location_source, location_updated_at, message
  )
  VALUES (
    auth.uid(), left(_patient_name, 200), left(_patient_phone, 64),
    _latitude, _longitude, _accuracy, _heading, _speed, 'gps', now(), left(_message, 2000)
  )
  RETURNING alert.id, alert.status;
$$;

REVOKE ALL ON FUNCTION public.submit_sos_alert(
  double precision, double precision, double precision, double precision,
  double precision, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_sos_alert(
  double precision, double precision, double precision, double precision,
  double precision, text, text, text
) TO anon, authenticated;

DROP POLICY "Anyone can create alert" ON public.alerts;
REVOKE INSERT ON public.alerts FROM anon, authenticated;

CREATE POLICY "Admins read alerts" ON public.alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins dispatch alerts" ON public.alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
