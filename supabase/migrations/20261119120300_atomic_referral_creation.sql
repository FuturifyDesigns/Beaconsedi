CREATE FUNCTION public.create_referral(_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.referrals%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'hospital')) THEN RAISE EXCEPTION 'Coordinator access required'; END IF;
 INSERT INTO public.referrals(from_facility_id,to_facility_id,patient_ref,priority,patient_condition,clinical_notes,ambulance_type,referring_doctor,contact_person,contact_phone,provider,created_by)
 VALUES((_payload->>'fromFacilityId')::uuid,(_payload->>'toFacilityId')::uuid,btrim(_payload->>'patientRef'),_payload->>'priority',
 _payload->>'patientCondition',_payload->>'clinicalNotes',_payload->>'ambulanceType',_payload->>'referringDoctor',_payload->>'contactPerson',_payload->>'contactPhone',_payload->>'provider',auth.uid()) RETURNING * INTO r;
 INSERT INTO public.referral_status_history(referral_id,status,actor_id,note) VALUES(r.id,'pending',auth.uid(),'Referral created');
 INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata) VALUES(auth.uid(),'referral_created','referral',r.id::text,jsonb_build_object('reference',r.reference,'priority',r.priority));
 RETURN jsonb_build_object('ok',true,'id',r.id,'reference',r.reference);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'An open referral already exists for this patient on this route. Refresh the referral list.';
END $$;
REVOKE ALL ON FUNCTION public.create_referral(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_referral(jsonb) TO authenticated;
ALTER TABLE public.referrals ADD CONSTRAINT referral_distance_valid CHECK (total_distance_km IS NULL OR total_distance_km BETWEEN 0 AND 100000);
ALTER TABLE public.referrals ADD CONSTRAINT referral_eta_valid CHECK (eta_minutes IS NULL OR eta_minutes BETWEEN 0 AND 100000);
ALTER TABLE public.referrals ADD CONSTRAINT referral_route_length CHECK (route_polyline IS NULL OR length(route_polyline)<=100000);
