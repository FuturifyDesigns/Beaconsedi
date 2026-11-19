-- One transaction records a journey change, fleet reservation, history and handover.
CREATE UNIQUE INDEX referral_open_patient_route ON public.referrals (lower(btrim(patient_ref)), from_facility_id, to_facility_id)
 WHERE status NOT IN ('completed','cancelled','declined');
CREATE UNIQUE INDEX referral_one_active_unit ON public.referrals(unit_id)
 WHERE unit_id IS NOT NULL AND status NOT IN ('completed','cancelled','declined');

CREATE OR REPLACE FUNCTION public.mutate_referral(_id uuid, _action text, _payload jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.referrals%ROWTYPE; u public.responder_units%ROWTYPE;
 coordinator boolean; target text; allowed text[]; unit_status text; note text;
BEGIN
 coordinator := public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'hospital');
 IF auth.uid() IS NULL OR NOT (coordinator OR public.has_role(auth.uid(),'responder') OR public.has_role(auth.uid(),'crew')) THEN RAISE EXCEPTION 'Staff access required'; END IF;
 SELECT * INTO r FROM public.referrals WHERE id = _id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Referral not found'; END IF;
 IF NOT coordinator AND NOT EXISTS(SELECT 1 FROM public.responder_units WHERE id=r.unit_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Only the assigned crew may update this journey'; END IF;
 note := nullif(btrim(_payload->>'note'),'');
 IF length(coalesce(note,'')) > 400 THEN RAISE EXCEPTION 'Note must be 400 characters or fewer'; END IF;
 IF _action = 'respond' THEN
   IF NOT coordinator OR r.status <> 'pending' THEN RAISE EXCEPTION 'Referral has already been decided or access is denied'; END IF;
   target := CASE _payload->>'decision' WHEN 'accept' THEN 'accepted' WHEN 'decline' THEN 'declined' END;
   IF target IS NULL THEN RAISE EXCEPTION 'Invalid decision'; END IF;
   UPDATE public.referrals SET status=target,decision_note=note,accepted_at=CASE WHEN target='accepted' THEN now() END WHERE id=_id;
 ELSIF _action = 'assign' THEN
   IF NOT coordinator OR r.status NOT IN ('accepted','assigned') THEN RAISE EXCEPTION 'Accept the referral before assigning a vehicle'; END IF;
   SELECT * INTO u FROM public.responder_units WHERE id=(_payload->>'unitId')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Vehicle not found'; END IF;
   IF u.status <> 'available' AND r.unit_id IS DISTINCT FROM u.id THEN RAISE EXCEPTION 'Vehicle is unavailable'; END IF;
   IF EXISTS(SELECT 1 FROM public.alerts WHERE assigned_unit_id=u.id AND status NOT IN ('resolved','cancelled')) THEN RAISE EXCEPTION 'Vehicle is responding to an incident'; END IF;
   IF EXISTS(SELECT 1 FROM public.referrals WHERE unit_id=u.id AND id<>r.id AND status NOT IN ('completed','cancelled','declined')) THEN RAISE EXCEPTION 'Vehicle already has an open referral'; END IF;
   IF length(coalesce(_payload->>'driverName',''))>200 OR length(coalesce(_payload->>'crew',''))>200 OR length(coalesce(_payload->>'provider',''))>200
      OR length(coalesce(_payload->>'routePolyline',''))>100000 THEN RAISE EXCEPTION 'Assignment details are too long'; END IF;
   IF (_payload->>'totalDistanceKm')::double precision < 0 OR (_payload->>'etaMinutes')::integer < 0 THEN RAISE EXCEPTION 'Distance and ETA cannot be negative'; END IF;
   IF r.unit_id IS NOT NULL AND r.unit_id<>u.id THEN UPDATE public.responder_units SET status='available' WHERE id=r.unit_id; END IF;
   UPDATE public.responder_units SET status='en_route' WHERE id=u.id;
   UPDATE public.referrals SET status='assigned',unit_id=u.id,driver_name=nullif(_payload->>'driverName',''),driver_phone=nullif(_payload->>'driverPhone',''),
     crew=nullif(_payload->>'crew',''),provider=coalesce(nullif(_payload->>'provider',''),provider),
     total_distance_km=(_payload->>'totalDistanceKm')::double precision,route_polyline=_payload->>'routePolyline',eta_minutes=(_payload->>'etaMinutes')::integer WHERE id=_id;
   target := 'assigned'; note := 'Vehicle ' || u.call_sign || ' assigned';
 ELSIF _action = 'advance' THEN
   target := _payload->>'to';
   allowed := CASE r.status
     WHEN 'pending' THEN ARRAY['cancelled'] WHEN 'accepted' THEN ARRAY['cancelled']
     WHEN 'assigned' THEN ARRAY['preparing','cancelled'] WHEN 'preparing' THEN ARRAY['departed','cancelled']
     WHEN 'departed' THEN ARRAY['en_route','cancelled'] WHEN 'en_route' THEN ARRAY['approaching','arrived','cancelled']
     WHEN 'approaching' THEN ARRAY['arrived','cancelled'] WHEN 'arrived' THEN ARRAY['handover','cancelled']
     WHEN 'handover' THEN ARRAY['completed'] ELSE ARRAY[]::text[] END;
   IF target IS NULL OR NOT target=ANY(allowed) THEN RAISE EXCEPTION 'Invalid or outdated journey transition. Refresh and try again.'; END IF;
   IF target='cancelled' AND NOT coordinator THEN RAISE EXCEPTION 'Coordinator access required'; END IF;
   IF target='handover' THEN
     IF nullif(btrim(_payload->>'handoverReceivedBy'),'') IS NULL OR length(_payload->>'handoverReceivedBy')>120 OR length(coalesce(_payload->>'handoverNotes',''))>400 THEN RAISE EXCEPTION 'Enter the receiving person and valid handover notes'; END IF;
     INSERT INTO public.referral_handover(referral_id,received_by,notes,actor_id) VALUES(_id,btrim(_payload->>'handoverReceivedBy'),_payload->>'handoverNotes',auth.uid());
   END IF;
   UPDATE public.referrals SET status=target,
     departed_at=CASE WHEN target='departed' THEN now() ELSE departed_at END,
     arrived_at=CASE WHEN target='arrived' THEN now() ELSE arrived_at END,
     completed_at=CASE WHEN target='completed' THEN now() ELSE completed_at END WHERE id=_id;
   unit_status := CASE WHEN target IN ('departed','en_route','approaching') THEN 'transporting' WHEN target IN ('arrived','handover') THEN 'on_scene' WHEN target IN ('completed','cancelled') THEN 'available' END;
   IF r.unit_id IS NOT NULL AND unit_status IS NOT NULL THEN UPDATE public.responder_units SET status=unit_status WHERE id=r.unit_id; END IF;
 ELSE RAISE EXCEPTION 'Invalid referral action'; END IF;
 INSERT INTO public.referral_status_history(referral_id,status,note,actor_id) VALUES(_id,target,note,auth.uid());
 INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata) VALUES(auth.uid(),'referral_'||target,'referral',_id::text,jsonb_build_object('reference',r.reference));
 RETURN jsonb_build_object('ok',true,'reference',r.reference,'status',target);
END $$;
REVOKE ALL ON FUNCTION public.mutate_referral(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mutate_referral(uuid,text,jsonb) TO authenticated;
-- All modifications must pass the transactional workflow; staff retain role-gated reads.
REVOKE INSERT,UPDATE,DELETE ON public.referrals FROM authenticated;
REVOKE INSERT ON public.referral_status_history,public.referral_handover FROM authenticated;

CREATE OR REPLACE FUNCTION public.validate_referral_fields() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE item record; value text;
BEGIN
 IF NEW.from_facility_id=NEW.to_facility_id THEN RAISE EXCEPTION 'Departure and destination must differ'; END IF;
 IF nullif(btrim(NEW.patient_ref),'') IS NULL OR length(NEW.patient_ref)>80 THEN RAISE EXCEPTION 'Patient reference is required and must be 80 characters or fewer'; END IF;
 IF NEW.priority NOT IN ('critical','emergency','urgent','routine') THEN RAISE EXCEPTION 'Invalid referral priority'; END IF;
 FOR item IN SELECT e.key,e.value FROM jsonb_each(to_jsonb(NEW)) e LOOP
   IF jsonb_typeof(item.value) <> 'string' THEN CONTINUE; END IF;
   value := item.value #>> '{}';
   IF item.key <> 'route_polyline' AND length(value)>400 THEN RAISE EXCEPTION '% must be 400 characters or fewer',replace(item.key,'_',' '); END IF;
   IF item.key IN ('driver_phone','contact_phone') AND value <> '' AND (value !~ '^\+?[0-9 ()-]+$' OR length(value)>25 OR length(regexp_replace(value,'[^0-9]','','g')) NOT BETWEEN 7 AND 15) THEN RAISE EXCEPTION 'Enter a valid phone with 7–15 digits'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_referral_fields BEFORE INSERT OR UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.validate_referral_fields();
