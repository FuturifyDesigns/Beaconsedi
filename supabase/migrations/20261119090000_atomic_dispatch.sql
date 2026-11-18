CREATE FUNCTION public.dispatch_incident(_alert_id uuid, _unit_id uuid, _eta integer DEFAULT NULL, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE incident public.alerts; unit public.responder_units;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT * INTO incident FROM public.alerts WHERE id = _alert_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Incident not found'; END IF;
  SELECT * INTO unit FROM public.responder_units WHERE id = _unit_id FOR UPDATE;
  IF NOT FOUND OR unit.user_id IS NULL THEN RAISE EXCEPTION 'Assigned responder required'; END IF;
  IF incident.assigned_unit_id = _unit_id AND unit.current_alert_id = _alert_id AND incident.status = 'dispatched' THEN RETURN; END IF;
  IF incident.status NOT IN ('active', 'acknowledged') OR incident.assigned_unit_id IS NOT NULL THEN
    RAISE EXCEPTION 'Incident has already been dispatched or closed';
  END IF;
  IF unit.status <> 'available' OR unit.current_alert_id IS NOT NULL THEN RAISE EXCEPTION 'Unit is no longer available'; END IF;
  UPDATE public.responder_units SET status = 'en_route', current_alert_id = _alert_id, eta_minutes = _eta WHERE id = _unit_id;
  UPDATE public.alerts SET status = 'dispatched', assigned_unit_id = _unit_id, responder_id = unit.user_id, eta_minutes = _eta WHERE id = _alert_id;
  INSERT INTO public.incident_events(alert_id, event_type, actor_id, note)
    VALUES (_alert_id, 'unit_dispatched', auth.uid(), COALESCE(_note, unit.call_sign));
  INSERT INTO public.audit_logs(actor_id, action, target_type, target_id, metadata)
    VALUES (auth.uid(), 'dispatch_unit', 'alert', _alert_id::text, jsonb_build_object('unit', _unit_id));
END $$;
REVOKE ALL ON FUNCTION public.dispatch_incident(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_incident(uuid, uuid, integer, text) TO authenticated;
