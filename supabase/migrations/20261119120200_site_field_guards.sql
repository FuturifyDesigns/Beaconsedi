CREATE FUNCTION public.validate_incident_fields() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE doc jsonb:=to_jsonb(NEW); item record; value text; maximum integer;
BEGIN
 FOR item IN SELECT e.key,e.value FROM jsonb_each(doc) e LOOP
  IF jsonb_typeof(item.value)<>'string' THEN CONTINUE; END IF;
  value:=item.value #>> '{}';
  maximum:=CASE item.key WHEN 'patient_name' THEN 200 WHEN 'patient_phone' THEN 25 WHEN 'message' THEN 2000 WHEN 'responder_notes' THEN 2000 WHEN 'address' THEN 1000 WHEN 'body' THEN 800 WHEN 'note' THEN 2000 ELSE 400 END;
  IF length(value)>maximum THEN RAISE EXCEPTION '% must be % characters or fewer',replace(item.key,'_',' '),maximum; END IF;
  IF item.key='patient_phone' AND btrim(value)<>'' AND (value !~ '^\+?[0-9 ()-]+$' OR length(regexp_replace(value,'[^0-9]','','g')) NOT BETWEEN 7 AND 15) THEN RAISE EXCEPTION 'Callback phone must contain 7–15 digits'; END IF;
 END LOOP;
 IF TG_TABLE_NAME='alerts' THEN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL OR NOT (NEW.latitude BETWEEN -90 AND 90 AND NEW.longitude BETWEEN -180 AND 180) THEN RAISE EXCEPTION 'Invalid coordinates'; END IF;
  IF NEW.accuracy IS NOT NULL AND NOT (NEW.accuracy BETWEEN 0 AND 100000) THEN RAISE EXCEPTION 'Invalid GPS accuracy'; END IF;
  IF NEW.patient_count IS NOT NULL AND NEW.patient_count NOT BETWEEN 1 AND 999 THEN RAISE EXCEPTION 'Patients involved must be between 1 and 999'; END IF;
  IF length(coalesce(NEW.triage->>'hazards',''))>400 OR length(coalesce(NEW.triage->>'resources',''))>400 THEN RAISE EXCEPTION 'Triage details must be 400 characters or fewer'; END IF;
 END IF;
 IF TG_TABLE_NAME='incident_messages' AND nullif(btrim(doc->>'body'),'') IS NULL THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_incident_fields BEFORE INSERT OR UPDATE ON public.alerts FOR EACH ROW EXECUTE FUNCTION public.validate_incident_fields();
CREATE TRIGGER validate_message_fields BEFORE INSERT OR UPDATE ON public.incident_messages FOR EACH ROW EXECUTE FUNCTION public.validate_incident_fields();
CREATE TRIGGER validate_event_fields BEFORE INSERT OR UPDATE ON public.incident_events FOR EACH ROW EXECUTE FUNCTION public.validate_incident_fields();
CREATE TRIGGER validate_vehicle_fields BEFORE INSERT OR UPDATE ON public.responder_units FOR EACH ROW EXECUTE FUNCTION public.validate_user_fields();

-- Validate full submissions instead of silently discarding the end of a name or message.
CREATE OR REPLACE FUNCTION public.submit_sos_alert(_latitude double precision,_longitude double precision,
 _accuracy double precision DEFAULT NULL,_heading double precision DEFAULT NULL,_speed double precision DEFAULT NULL,
 _patient_name text DEFAULT NULL,_patient_phone text DEFAULT NULL,_message text DEFAULT NULL)
RETURNS TABLE(id uuid,status text) LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO public.alerts AS alert(patient_id,patient_name,patient_phone,latitude,longitude,accuracy,heading,speed,location_source,location_updated_at,message)
 VALUES(auth.uid(),nullif(btrim(_patient_name),''),nullif(btrim(_patient_phone),''),_latitude,_longitude,_accuracy,_heading,_speed,'gps',now(),nullif(btrim(_message),''))
 RETURNING alert.id,alert.status;
$$;
