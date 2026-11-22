-- New assistance requests belong to a registered, signed-in patient.
CREATE OR REPLACE FUNCTION public.submit_sos_alert(_latitude double precision,_longitude double precision,
 _accuracy double precision DEFAULT NULL,_heading double precision DEFAULT NULL,_speed double precision DEFAULT NULL,
 _patient_name text DEFAULT NULL,_patient_phone text DEFAULT NULL,_message text DEFAULT NULL)
RETURNS TABLE(id uuid,status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR coalesce(auth.jwt()->>'is_anonymous','false')='true' THEN
  RAISE EXCEPTION 'Sign in with a registered account to request assistance' USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 INSERT INTO public.alerts AS alert(patient_id,patient_name,patient_phone,latitude,longitude,accuracy,heading,speed,location_source,location_updated_at,message)
 VALUES(auth.uid(),nullif(btrim(_patient_name),''),nullif(btrim(_patient_phone),''),_latitude,_longitude,_accuracy,_heading,_speed,'gps',now(),nullif(btrim(_message),''))
 RETURNING alert.id,alert.status;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_sos_alert(double precision,double precision,double precision,double precision,double precision,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_sos_alert(double precision,double precision,double precision,double precision,double precision,text,text,text) TO authenticated;
REVOKE INSERT ON public.alerts FROM PUBLIC, anon;
