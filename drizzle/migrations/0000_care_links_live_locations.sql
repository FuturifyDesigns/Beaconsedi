CREATE TABLE public.care_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  carer_id uuid NOT NULL,
  relationship text,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, carer_id),
  CHECK (patient_id <> carer_id),
  CHECK (status IN ('pending','accepted','declined'))
);
GRANT SELECT, UPDATE, DELETE ON public.care_links TO authenticated;
GRANT ALL ON public.care_links TO service_role;
ALTER TABLE public.care_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view own care links" ON public.care_links FOR SELECT TO authenticated
  USING (auth.uid() = patient_id OR auth.uid() = carer_id);
CREATE POLICY "Invitee responds to care link" ON public.care_links FOR UPDATE TO authenticated
  USING ((auth.uid() = patient_id OR auth.uid() = carer_id) AND auth.uid() <> created_by)
  WITH CHECK ((auth.uid() = patient_id OR auth.uid() = carer_id) AND status IN ('accepted','declined'));
CREATE POLICY "Members remove care link" ON public.care_links FOR DELETE TO authenticated
  USING (auth.uid() = patient_id OR auth.uid() = carer_id);
CREATE TRIGGER care_links_updated BEFORE UPDATE ON public.care_links FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_carer_of(_patient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.care_links
    WHERE patient_id = _patient AND carer_id = auth.uid() AND status = 'accepted')
$$;

CREATE TABLE public.live_locations (
  user_id uuid PRIMARY KEY,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  heading double precision,
  speed double precision,
  sharing boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.live_locations TO authenticated;
GRANT ALL ON public.live_locations TO service_role;
ALTER TABLE public.live_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner views own location" ON public.live_locations FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Carers view shared location" ON public.live_locations FOR SELECT TO authenticated USING (sharing AND public.is_carer_of(user_id));
CREATE POLICY "Owner deletes own location" ON public.live_locations FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Carers view linked patient alerts" ON public.alerts FOR SELECT TO authenticated
  USING (patient_id IS NOT NULL AND public.is_carer_of(patient_id));

CREATE OR REPLACE FUNCTION public.lookup_profile_by_email(_email text)
RETURNS TABLE(id uuid, full_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, p.full_name FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  WHERE auth.uid() IS NOT NULL AND lower(u.email) = lower(trim(_email)) AND u.id <> auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.create_care_link(_email text, _as_patient boolean, _relationship text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _other uuid; _id uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT u.id INTO _other FROM auth.users u WHERE lower(u.email) = lower(trim(_email));
  IF _other IS NULL THEN RAISE EXCEPTION 'No Beacon account uses that email'; END IF;
  IF _other = _me THEN RAISE EXCEPTION 'You cannot link to yourself'; END IF;
  INSERT INTO public.care_links (patient_id, carer_id, relationship, created_by)
  VALUES (CASE WHEN _as_patient THEN _me ELSE _other END, CASE WHEN _as_patient THEN _other ELSE _me END,
          nullif(trim(_relationship), ''), _me)
  ON CONFLICT (patient_id, carer_id) DO UPDATE SET status = 'pending', created_by = _me,
    relationship = EXCLUDED.relationship
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_live_location(_lat double precision, _lng double precision,
  _accuracy double precision DEFAULT NULL, _heading double precision DEFAULT NULL,
  _speed double precision DEFAULT NULL, _sharing boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Invalid coordinates'; END IF;
  INSERT INTO public.live_locations (user_id, latitude, longitude, accuracy, heading, speed, sharing, updated_at)
  VALUES (auth.uid(), _lat, _lng, _accuracy, _heading, _speed, _sharing, now())
  ON CONFLICT (user_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
    accuracy = EXCLUDED.accuracy, heading = EXCLUDED.heading, speed = EXCLUDED.speed,
    sharing = EXCLUDED.sharing, updated_at = now();
END $$;

REVOKE EXECUTE ON FUNCTION public.lookup_profile_by_email(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_care_link(text, boolean, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.upsert_live_location(double precision, double precision, double precision, double precision, double precision, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lookup_profile_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_care_link(text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_live_location(double precision, double precision, double precision, double precision, double precision, boolean) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.care_links;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_locations;