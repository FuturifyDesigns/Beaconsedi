-- Run using the database's trusted SQL connection. All fixtures are rolled back.
CREATE OR REPLACE FUNCTION pg_temp.verify_incident_integrity() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE crew uuid:=gen_random_uuid(); patient uuid:=gen_random_uuid(); administrator uuid;
  test_unit uuid:=gen_random_uuid(); incident uuid:=gen_random_uuid(); rejected boolean; before_events integer;
BEGIN
 BEGIN
  SELECT user_id INTO administrator FROM public.user_roles WHERE role='admin' LIMIT 1;
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
   (crew,'integrity-crew-'||crew||'@example.invalid','{}'),(patient,'integrity-patient-'||patient||'@example.invalid','{}');
  INSERT INTO public.user_roles(user_id,role) VALUES(crew,'crew');
  INSERT INTO public.responder_profiles(user_id,full_name,phone,email) VALUES(crew,'TEST integrity crew','+26771234567','integrity@example.invalid');
  INSERT INTO public.responder_units(id,name,call_sign,status) VALUES(test_unit,'TEST integrity ambulance','TEST-INTEGRITY','available');
  PERFORM set_config('request.jwt.claim.sub',administrator::text,true);
  PERFORM public.admin_assign_responder_vehicle(crew,'integrity@example.invalid',test_unit);
  PERFORM set_config('request.jwt.claim.sub',crew::text,true);
  PERFORM public.change_own_shift('clock_in');
  INSERT INTO public.alerts(id,patient_id,latitude,longitude) VALUES(incident,patient,-24.65,25.91);
  SET LOCAL ROLE authenticated;
  PERFORM public.accept_crew_incident(incident);
  rejected:=false; BEGIN PERFORM public.transition_incident(incident,'transport'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected OR (SELECT status FROM public.alerts WHERE id=incident)<>'dispatched' THEN RAISE EXCEPTION 'Skipped transition accepted or partially saved'; END IF;
  rejected:=false; BEGIN UPDATE public.alerts SET status='resolved' WHERE id=incident; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Direct lifecycle write accepted'; END IF;
  INSERT INTO public.responder_locations(responder_id,unit_id,incident_id,latitude,longitude,recorded_at) VALUES(crew,test_unit,incident,-24.64,25.92,now());
  INSERT INTO public.responder_locations(responder_id,unit_id,incident_id,latitude,longitude,recorded_at) VALUES(crew,test_unit,incident,-24.66,25.92,now()-interval '1 minute');
  IF (SELECT latitude FROM public.responder_units WHERE id=test_unit)<>-24.64 THEN RAISE EXCEPTION 'Older GPS rewound vehicle'; END IF;
  rejected:=false; BEGIN INSERT INTO public.responder_locations(responder_id,unit_id,incident_id,latitude,longitude,recorded_at) VALUES(crew,test_unit,incident,-24.64,25.92,now()+interval '1 hour'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'Future GPS accepted'; END IF;
  PERFORM public.transition_incident(incident,'arrive');
  IF (SELECT status FROM public.responder_units WHERE id=test_unit)<>'on_scene' THEN RAISE EXCEPTION 'Arrival did not synchronize test_unit'; END IF;
  PERFORM public.transition_incident(incident,'transport');
  IF (SELECT status FROM public.responder_units WHERE id=test_unit)<>'transporting' THEN RAISE EXCEPTION 'Transport did not synchronize test_unit'; END IF;
  PERFORM public.transition_incident(incident,'resolve');
  PERFORM public.transition_incident(incident,'resolve');
  IF (SELECT count(*) FROM public.incident_events WHERE alert_id=incident AND event_type='incident_closed')<>1 THEN RAISE EXCEPTION 'Repeated close duplicated history'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.responder_units WHERE id=test_unit AND status='available' AND current_alert_id IS NULL) THEN RAISE EXCEPTION 'Closing did not release ambulance'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id=patient) THEN RAISE EXCEPTION 'Closed incident retained medical access'; END IF;
  PERFORM public.change_own_shift('clock_out');
  SELECT count(*) INTO before_events FROM public.responder_locations WHERE responder_id=crew;
  INSERT INTO public.responder_locations(responder_id,unit_id,incident_id,latitude,longitude) VALUES(crew,test_unit,incident,-24.64,25.92);
  IF (SELECT count(*) FROM public.responder_locations WHERE responder_id=crew)<>before_events THEN RAISE EXCEPTION 'Off-duty delayed GPS retained'; END IF;
  IF has_column_privilege('authenticated','public.incident_messages','body','UPDATE') THEN RAISE EXCEPTION 'Delivered message bodies writable'; END IF;
  IF NOT has_column_privilege('authenticated','public.incident_messages','listened_at','UPDATE') THEN RAISE EXCEPTION 'Playback receipts unavailable'; END IF;
  RAISE EXCEPTION USING ERRCODE='PT001',MESSAGE='Rollback verification fixtures';
 EXCEPTION WHEN SQLSTATE 'PT001' THEN NULL; END;
 RETURN jsonb_build_object('passed',true,'fixtures','Rolled back','checks',jsonb_build_array('Atomic ordered lifecycle and vehicle changes','Idempotent closure and history','Direct lifecycle bypass denied','Out-of-order and future GPS protection','Off-duty delayed GPS discarded','Medical access ends at closure','Message immutability and receipt privileges'));
END $$;
SELECT pg_temp.verify_incident_integrity() AS verification;
