CREATE OR REPLACE FUNCTION public.can_access_incident(_alert_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role(auth.uid(),'admin') OR EXISTS(
  SELECT 1 FROM public.alerts WHERE id=_alert_id AND (patient_id=auth.uid() OR (responder_id=auth.uid() AND public.has_role(auth.uid(),'responder')))
 )
$$;
DROP POLICY "Read incident messages" ON public.incident_messages;
CREATE POLICY "Read incident messages" ON public.incident_messages FOR SELECT TO authenticated USING(public.can_access_incident(alert_id));
DROP POLICY "Mark incident messages read" ON public.incident_messages;
DROP POLICY "Patients update own incident messages" ON public.incident_messages;
CREATE POLICY "Recipients mark incident messages read" ON public.incident_messages FOR UPDATE TO authenticated
 USING(sender_id<>auth.uid() AND public.can_access_incident(alert_id)) WITH CHECK(sender_id<>auth.uid() AND public.can_access_incident(alert_id));
CREATE FUNCTION public.validate_incident_sender() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); incident public.alerts%ROWTYPE;
BEGIN
 IF actor IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO incident FROM public.alerts WHERE id=NEW.alert_id;
 IF NOT FOUND OR NEW.sender_id IS DISTINCT FROM actor OR NOT public.can_access_incident(NEW.alert_id) THEN RAISE EXCEPTION 'Only incident participants may send a message'; END IF;
 IF (NEW.sender_role='patient' AND incident.patient_id IS DISTINCT FROM actor)
 OR (NEW.sender_role='responder' AND (incident.responder_id IS DISTINCT FROM actor OR NOT public.has_role(actor,'responder')))
 OR (NEW.sender_role='dispatcher' AND NOT public.has_role(actor,'admin'))
 OR NEW.sender_role NOT IN ('patient','responder','dispatcher') THEN RAISE EXCEPTION 'Message sender role does not match this incident'; END IF;
 IF NEW.kind NOT IN ('text','voice') OR NEW.recipient_role NOT IN ('patient','responder','dispatcher') THEN RAISE EXCEPTION 'Invalid message type or recipient'; END IF;
 IF NEW.kind='voice' AND (NEW.duration_seconds IS NULL OR NEW.duration_seconds NOT BETWEEN 1 AND 120 OR NEW.media_path IS NULL OR split_part(NEW.media_path,'/',1)<>NEW.alert_id::text) THEN RAISE EXCEPTION 'Invalid voice recording'; END IF;
 NEW.listened_at:=null;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_incident_sender BEFORE INSERT ON public.incident_messages FOR EACH ROW EXECUTE FUNCTION public.validate_incident_sender();
