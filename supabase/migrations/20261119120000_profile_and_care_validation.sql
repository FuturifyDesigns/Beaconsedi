-- Validate direct database writes as well as browser forms.
CREATE OR REPLACE FUNCTION public.validate_user_fields() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE entry record; doc jsonb := to_jsonb(NEW); value text; digits text;
BEGIN
  FOR entry IN SELECT e.key, e.value FROM jsonb_each(doc) e LOOP
    IF jsonb_typeof(entry.value) <> 'string' THEN CONTINUE; END IF;
    value := entry.value #>> '{}';
    IF length(value) > (CASE WHEN entry.key IN ('allergies','medical_conditions','medications','notes','responder_notes') THEN 2000 WHEN entry.key IN ('photo_url') THEN 2048 ELSE 400 END) THEN
      RAISE EXCEPTION '% is too long', replace(entry.key, '_', ' ');
    END IF;
    IF entry.key IN ('full_name','emergency_contact_name') AND length(value) > 200 THEN RAISE EXCEPTION 'Name must be 200 characters or fewer'; END IF;
    IF entry.key IN ('phone','emergency_contact_phone','driver_phone','contact_phone') AND btrim(value) <> '' THEN
      digits := regexp_replace(value, '[^0-9]', '', 'g');
      IF length(value) > 25 OR value !~ '^\+?[0-9 ()-]+$' OR length(digits) NOT BETWEEN 7 AND 15 THEN RAISE EXCEPTION 'Phone must contain 7–15 digits with an optional country code'; END IF;
    END IF;
  END LOOP;
  IF TG_TABLE_NAME = 'profiles' AND coalesce(doc->>'blood_type','') NOT IN ('','A+','A-','B+','B-','AB+','AB-','O+','O-') THEN RAISE EXCEPTION 'Choose a valid blood type'; END IF;
  IF TG_TABLE_NAME = 'responder_profiles' THEN
    IF NEW.years_of_service NOT BETWEEN 0 AND 80 THEN RAISE EXCEPTION 'Years of service must be between 0 and 80'; END IF;
    IF NEW.date_of_birth > current_date THEN RAISE EXCEPTION 'Date of birth cannot be in the future'; END IF;
    IF coalesce(NEW.email,'') <> '' AND NEW.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a valid email'; END IF;
    IF coalesce(NEW.photo_url,'') <> '' AND NEW.photo_url !~ '^https?://' THEN RAISE EXCEPTION 'Photograph must be an http or https URL'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_profile_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_user_fields();
CREATE TRIGGER validate_responder_fields BEFORE INSERT OR UPDATE ON public.responder_profiles FOR EACH ROW EXECUTE FUNCTION public.validate_user_fields();

-- A care invitation may only be answered once, by its recipient. Identities cannot be rewritten.
REVOKE UPDATE ON public.care_links FROM authenticated;
GRANT UPDATE(status) ON public.care_links TO authenticated;
DROP POLICY "Invitee responds to care link" ON public.care_links;
CREATE POLICY "Invitee responds to care link" ON public.care_links FOR UPDATE TO authenticated
 USING ((auth.uid() = patient_id OR auth.uid() = carer_id) AND auth.uid() <> created_by AND status = 'pending')
 WITH CHECK ((auth.uid() = patient_id OR auth.uid() = carer_id) AND auth.uid() <> created_by AND status IN ('accepted','declined'));

-- Return only linked display names; care membership never grants general medical-record access.
CREATE FUNCTION public.care_link_names() RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p.id,p.full_name FROM public.profiles p WHERE EXISTS (
   SELECT 1 FROM public.care_links c WHERE (c.patient_id=auth.uid() AND c.carer_id=p.id)
   OR (c.carer_id=auth.uid() AND c.patient_id=p.id))
$$;
REVOKE ALL ON FUNCTION public.care_link_names() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.care_link_names() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_care_link(_email text, _as_patient boolean, _relationship text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid(); _other uuid; _id uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF _email IS NULL OR length(_email) > 254 OR btrim(_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a valid email'; END IF;
  IF _as_patient IS NULL OR length(coalesce(_relationship,'')) > 120 THEN RAISE EXCEPTION 'Relationship must be 120 characters or fewer'; END IF;
  SELECT u.id INTO _other FROM auth.users u WHERE lower(u.email) = lower(trim(_email));
  IF _other IS NULL THEN RAISE EXCEPTION 'No Beacon account uses that email'; END IF;
  IF _other = _me THEN RAISE EXCEPTION 'You cannot link to yourself'; END IF;
  INSERT INTO public.care_links (patient_id, carer_id, relationship, created_by)
  VALUES (CASE WHEN _as_patient THEN _me ELSE _other END, CASE WHEN _as_patient THEN _other ELSE _me END, nullif(trim(_relationship), ''), _me)
  ON CONFLICT (patient_id, carer_id) DO NOTHING RETURNING id INTO _id;
  IF _id IS NULL THEN RAISE EXCEPTION 'A link or invitation already exists. Remove it before inviting again.'; END IF;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_live_location(_lat double precision, _lng double precision,
 _accuracy double precision DEFAULT NULL, _heading double precision DEFAULT NULL,
 _speed double precision DEFAULT NULL, _sharing boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF _sharing IS FALSE THEN DELETE FROM public.live_locations WHERE user_id = auth.uid(); RETURN; END IF;
  IF _sharing IS NULL OR _lat IS NULL OR _lng IS NULL OR NOT (_lat BETWEEN -90 AND 90 AND _lng BETWEEN -180 AND 180)
    OR (_accuracy IS NOT NULL AND NOT (_accuracy BETWEEN 0 AND 100000))
    OR (_heading IS NOT NULL AND NOT (_heading BETWEEN 0 AND 360))
    OR (_speed IS NOT NULL AND NOT (_speed BETWEEN 0 AND 500)) THEN RAISE EXCEPTION 'Invalid GPS reading'; END IF;
  INSERT INTO public.live_locations(user_id,latitude,longitude,accuracy,heading,speed,sharing,updated_at)
  VALUES(auth.uid(),_lat,_lng,_accuracy,_heading,_speed,true,now())
  ON CONFLICT(user_id) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,
   accuracy=EXCLUDED.accuracy,heading=EXCLUDED.heading,speed=EXCLUDED.speed,sharing=true,updated_at=now();
END $$;

-- Both responder roles can hold an assignment. Preserve the existing admin-only checks.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.admin_assign_responder_vehicle(uuid,text,uuid)'::regprocedure) INTO definition;
 definition := replace(definition, 'IF NOT public.has_role(_user_id, ''responder'') THEN',
 'IF NOT (public.has_role(_user_id, ''responder'') OR public.has_role(_user_id, ''crew'')) THEN');
 EXECUTE definition;
END $$;
