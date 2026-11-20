CREATE FUNCTION public.transition_incident(_alert_id uuid,_action text,_note text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); administrator boolean; incident public.alerts%ROWTYPE; vehicle public.responder_units%ROWTYPE;
 target_status text; event_name text; next_vehicle_status text;
BEGIN
 administrator:=public.has_role(actor,'admin');
 IF actor IS NULL OR NOT (administrator OR public.has_role(actor,'responder')) THEN RAISE EXCEPTION 'Responder access required'; END IF;
 IF _action IS NULL OR _action NOT IN ('acknowledge','arrive','transport','resolve','escalate') THEN RAISE EXCEPTION 'Invalid incident action'; END IF;
 IF length(coalesce(_note,''))>2000 THEN RAISE EXCEPTION 'Note must be 2000 characters or fewer'; END IF;
 PERFORM 1 FROM auth.users WHERE id=actor FOR UPDATE;
 SELECT * INTO incident FROM public.alerts WHERE id=_alert_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Incident not found'; END IF;
 IF NOT administrator THEN
   IF NOT EXISTS(SELECT 1 FROM public.shifts WHERE user_id=actor AND ended_at IS NULL AND status='on_duty') THEN RAISE EXCEPTION 'Clock in and end any break before updating a response'; END IF;
   IF incident.responder_id IS DISTINCT FROM actor AND NOT (_action='acknowledge' AND incident.status='active' AND incident.responder_id IS NULL AND incident.assigned_unit_id IS NULL) THEN RAISE EXCEPTION 'Only the assigned crew or an administrator may update this incident'; END IF;
 END IF;
 IF incident.assigned_unit_id IS NOT NULL THEN
   SELECT * INTO vehicle FROM public.responder_units WHERE id=incident.assigned_unit_id FOR UPDATE;
   IF NOT administrator AND vehicle.user_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'This vehicle is assigned to another responder'; END IF;
 END IF;
 target_status:=CASE _action WHEN 'acknowledge' THEN 'acknowledged' WHEN 'arrive' THEN 'on_scene' WHEN 'transport' THEN 'transporting' WHEN 'resolve' THEN 'resolved' ELSE incident.status END;
 IF _action<>'escalate' AND incident.status=target_status THEN RETURN; END IF;
 IF incident.status IN ('resolved','cancelled') THEN RAISE EXCEPTION 'This incident is already closed'; END IF;
 IF (_action='acknowledge' AND incident.status<>'active') OR (_action='arrive' AND incident.status<>'dispatched') OR (_action='transport' AND incident.status<>'on_scene') THEN RAISE EXCEPTION 'Incident changed. Refresh before continuing.'; END IF;
 IF _action='escalate' AND incident.priority='critical' THEN RETURN; END IF;
 UPDATE public.alerts SET status=target_status,
   responder_id=CASE WHEN _action='acknowledge' AND NOT administrator THEN actor ELSE responder_id END,
   priority=CASE WHEN _action='escalate' THEN 'critical' ELSE priority END,
   resolved_at=CASE WHEN _action='resolve' THEN now() ELSE resolved_at END,
   eta_minutes=CASE WHEN _action IN ('arrive','transport','resolve') THEN null ELSE eta_minutes END
 WHERE id=incident.id;
 next_vehicle_status:=CASE _action WHEN 'arrive' THEN 'on_scene' WHEN 'transport' THEN 'transporting' WHEN 'resolve' THEN 'available' END;
 IF vehicle.id IS NOT NULL AND next_vehicle_status IS NOT NULL THEN
   UPDATE public.responder_units SET status=next_vehicle_status,current_alert_id=CASE WHEN _action='resolve' THEN null ELSE incident.id END,eta_minutes=null WHERE id=vehicle.id AND (current_alert_id=incident.id OR current_alert_id IS NULL);
 END IF;
 event_name:=CASE _action WHEN 'acknowledge' THEN 'responder_accepted' WHEN 'arrive' THEN 'arrived_on_scene' WHEN 'transport' THEN 'patient_loaded' WHEN 'resolve' THEN 'incident_closed' ELSE 'escalated' END;
 INSERT INTO public.incident_events(alert_id,event_type,actor_id,note) VALUES(incident.id,event_name,actor,nullif(btrim(_note),''));
 INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata) VALUES(actor,'incident_'||_action,'alert',incident.id::text,jsonb_build_object('from',incident.status,'to',target_status,'unit_id',vehicle.id));
END $$;
REVOKE ALL ON FUNCTION public.transition_incident(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transition_incident(uuid,text,text) TO authenticated;

-- Staff must use the row-locked action above; admin-only triage tools retain their access.
CREATE FUNCTION public.protect_staff_incident_write() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user='authenticated' AND NOT public.has_role(auth.uid(),'admin') THEN
   IF OLD.responder_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the assigned crew may update this incident'; END IF;
   IF (to_jsonb(NEW)-ARRAY['responder_notes','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['responder_notes','updated_at']) THEN RAISE EXCEPTION 'Use the incident action controls to update a response'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_staff_incident_write BEFORE UPDATE ON public.alerts FOR EACH ROW EXECUTE FUNCTION public.protect_staff_incident_write();

CREATE FUNCTION public.protect_staff_vehicle_write() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user='authenticated' AND NOT public.has_role(auth.uid(),'admin') THEN
   IF OLD.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only your assigned vehicle may be updated'; END IF;
   IF (to_jsonb(NEW)-ARRAY['status','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at']) THEN RAISE EXCEPTION 'Only an administrator may change vehicle details'; END IF;
   IF NEW.status IS DISTINCT FROM OLD.status THEN
     IF NEW.status NOT IN ('available','busy','offline') THEN RAISE EXCEPTION 'Use incident actions to change the response stage'; END IF;
     IF OLD.current_alert_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.referrals WHERE unit_id=OLD.id AND status NOT IN ('completed','cancelled','declined')) THEN RAISE EXCEPTION 'Finish the active response before changing vehicle readiness'; END IF;
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_staff_vehicle_write BEFORE UPDATE ON public.responder_units FOR EACH ROW EXECUTE FUNCTION public.protect_staff_vehicle_write();
