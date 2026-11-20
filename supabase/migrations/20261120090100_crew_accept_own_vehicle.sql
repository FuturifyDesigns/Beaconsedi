CREATE FUNCTION public.accept_crew_incident(_alert_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE incident public.alerts%ROWTYPE; vehicle public.responder_units%ROWTYPE; staff_id uuid:=auth.uid();
BEGIN
 IF staff_id IS NULL OR NOT (public.has_role(staff_id,'responder') OR public.has_role(staff_id,'admin')) THEN RAISE EXCEPTION 'Crew or responder access required'; END IF;
 PERFORM 1 FROM auth.users WHERE id=staff_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.shifts WHERE user_id=staff_id AND ended_at IS NULL AND status='on_duty') THEN RAISE EXCEPTION 'Clock in and end any break before accepting a call'; END IF;
 SELECT * INTO incident FROM public.alerts WHERE id=_alert_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Incident not found'; END IF;
 SELECT u.* INTO vehicle FROM public.responder_units u JOIN public.responder_profiles p ON p.assigned_unit_id=u.id
 WHERE p.user_id=staff_id AND u.user_id=staff_id FOR UPDATE OF u;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ask an administrator to assign your ambulance before accepting a call'; END IF;
 IF incident.assigned_unit_id=vehicle.id AND incident.responder_id=staff_id AND incident.status='dispatched' THEN RETURN; END IF;
 IF incident.status NOT IN ('active','acknowledged') OR incident.assigned_unit_id IS NOT NULL OR (incident.responder_id IS NOT NULL AND incident.responder_id<>staff_id) THEN RAISE EXCEPTION 'This call has already been accepted or closed'; END IF;
 IF vehicle.status<>'available' OR vehicle.current_alert_id IS NOT NULL THEN RAISE EXCEPTION 'Your vehicle is not available for another call'; END IF;
 UPDATE public.alerts SET status='dispatched',responder_id=staff_id,assigned_unit_id=vehicle.id,eta_minutes=null WHERE id=incident.id;
 UPDATE public.responder_units SET status='en_route',current_alert_id=incident.id,eta_minutes=null WHERE id=vehicle.id;
 UPDATE public.responder_profiles SET availability='responding' WHERE user_id=staff_id;
 INSERT INTO public.incident_events(alert_id,event_type,actor_id,note) VALUES(incident.id,'unit_dispatched',staff_id,'Accepted by assigned crew: '||vehicle.call_sign);
 INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata) VALUES(staff_id,'crew_accept_incident','alert',incident.id::text,jsonb_build_object('unit',vehicle.id));
END $$;
REVOKE ALL ON FUNCTION public.accept_crew_incident(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_crew_incident(uuid) TO authenticated;
