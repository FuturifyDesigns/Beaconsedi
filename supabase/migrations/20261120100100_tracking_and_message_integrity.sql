CREATE FUNCTION public.validate_responder_ping() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); linked public.alerts%ROWTYPE;
BEGIN
 -- The trusted database/service role may import historical positions. Browser writes are scoped below.
 IF actor IS NULL THEN RETURN NEW; END IF;
 IF NEW.responder_id IS DISTINCT FROM actor OR NOT (public.has_role(actor,'responder') OR public.has_role(actor,'admin')) THEN RAISE EXCEPTION 'Responder identity does not match the GPS sender'; END IF;
 IF NEW.unit_id IS NOT NULL THEN
   PERFORM 1 FROM public.responder_units u JOIN public.responder_profiles p ON p.assigned_unit_id=u.id
   WHERE u.id=NEW.unit_id AND u.user_id=actor AND p.user_id=actor FOR UPDATE OF u;
   IF NOT FOUND THEN RAISE EXCEPTION 'GPS may only update your assigned vehicle'; END IF;
 END IF;
 IF NEW.incident_id IS NOT NULL THEN
   SELECT * INTO linked FROM public.alerts WHERE id=NEW.incident_id;
   IF NOT FOUND OR linked.responder_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'GPS may only reference your assigned incident'; END IF;
   IF linked.status IN ('resolved','cancelled') THEN NEW.incident_id:=null; END IF;
 END IF;
 IF NEW.incident_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.shifts WHERE user_id=actor AND ended_at IS NULL) THEN RETURN NULL; END IF;
 IF NEW.recorded_at IS NULL OR NEW.recorded_at<now()-interval '5 minutes' OR NEW.recorded_at>now()+interval '30 seconds'
 OR (NEW.accuracy IS NOT NULL AND NOT (NEW.accuracy BETWEEN 0 AND 100000))
 OR (NEW.heading IS NOT NULL AND NOT (NEW.heading BETWEEN 0 AND 360))
 OR (NEW.speed IS NOT NULL AND NOT (NEW.speed BETWEEN 0 AND 500)) THEN RAISE EXCEPTION 'Invalid or outdated GPS sample. Check device time and location services.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_responder_ping BEFORE INSERT ON public.responder_locations FOR EACH ROW EXECUTE FUNCTION public.validate_responder_ping();
CREATE OR REPLACE FUNCTION public.sync_unit_location() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.unit_id IS NOT NULL THEN
  UPDATE public.responder_units SET latitude=NEW.latitude,longitude=NEW.longitude,heading=NEW.heading,speed=NEW.speed,accuracy=NEW.accuracy,last_location_update=NEW.recorded_at,updated_at=now()
  WHERE id=NEW.unit_id AND (last_location_update IS NULL OR NEW.recorded_at>=last_location_update);
 END IF;
 RETURN NEW;
END $$;

-- Receipt updates may not rewrite a delivered message's text, sender or attachment.
REVOKE UPDATE ON public.incident_messages FROM authenticated;
GRANT UPDATE(listened_at) ON public.incident_messages TO authenticated;
CREATE POLICY "Owners remove undelivered voice uploads" ON storage.objects FOR DELETE TO authenticated USING (
 bucket_id='voice-notes' AND owner_id=auth.uid()::text AND NOT EXISTS(SELECT 1 FROM public.incident_messages m WHERE m.media_path=storage.objects.name)
);

-- Both responder role types receive medical details only for their active assigned patient.
ALTER POLICY "Users read own profile" ON public.profiles USING(auth.uid()=id);
DROP POLICY "Assigned crew read patient medical profiles" ON public.profiles;
CREATE POLICY "Assigned staff read active patient profile" ON public.profiles FOR SELECT TO authenticated USING (
 public.has_role(auth.uid(),'admin') OR (public.has_role(auth.uid(),'responder') AND EXISTS(
  SELECT 1 FROM public.alerts a WHERE a.patient_id=profiles.id AND a.responder_id=auth.uid() AND a.status NOT IN ('resolved','cancelled')
 ))
);
