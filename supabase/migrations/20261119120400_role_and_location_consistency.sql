-- A disconnected sharing device must not leave an old fix presented as live indefinitely.
DROP POLICY "Carers view shared location" ON public.live_locations;
CREATE POLICY "Carers view shared location" ON public.live_locations FOR SELECT TO authenticated
 USING (sharing AND updated_at>now()-interval '60 seconds' AND public.is_carer_of(user_id));

CREATE FUNCTION public.admin_set_role(_user_id uuid,_role public.app_role,_grant boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 PERFORM 1 FROM auth.users WHERE id=_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
 IF _grant IS NULL THEN RAISE EXCEPTION 'Choose a role action'; END IF;
 IF _grant THEN
   INSERT INTO public.user_roles(user_id,role) VALUES(_user_id,_role) ON CONFLICT(user_id,role) DO NOTHING;
 ELSE
   IF _user_id=auth.uid() AND _role='admin' THEN RAISE EXCEPTION 'You cannot revoke your own admin role'; END IF;
   IF _role IN ('responder','crew') AND public.has_role(_user_id,_role)
      AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role IN ('responder','crew') AND role<>_role) THEN
     IF EXISTS(SELECT 1 FROM public.responder_units WHERE user_id=_user_id AND (status<>'available' OR current_alert_id IS NOT NULL)) THEN RAISE EXCEPTION 'Finish the active vehicle assignment before removing the final responder role'; END IF;
     PERFORM public.admin_assign_responder_vehicle(_user_id,'',null);
   END IF;
   DELETE FROM public.user_roles WHERE user_id=_user_id AND role=_role;
 END IF;
 INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata)
 VALUES(auth.uid(),CASE WHEN _grant THEN 'role_granted' ELSE 'role_revoked' END,'user',_user_id::text,jsonb_build_object('role',_role));
END $$;
REVOKE ALL ON FUNCTION public.admin_set_role(uuid,public.app_role,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid,public.app_role,boolean) TO authenticated;

-- Assignment changes share the same per-user lock as role changes.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.admin_assign_responder_vehicle(uuid,text,uuid)'::regprocedure) INTO definition;
 definition:=replace(definition, '  IF NOT (public.has_role(_user_id, ''responder'')',
 '  PERFORM 1 FROM auth.users WHERE id=_user_id FOR UPDATE;
  IF NOT (public.has_role(_user_id, ''responder'')');
 definition:=replace(definition, '  IF _unit_id IS NOT NULL THEN',
 '  IF _old_unit_id IS DISTINCT FROM _unit_id AND EXISTS(SELECT 1 FROM public.responder_units WHERE id IN (_old_unit_id,_unit_id) AND (status<>''available'' OR current_alert_id IS NOT NULL)) THEN
    RAISE EXCEPTION ''Finish the active vehicle assignment before changing its responder'';
  END IF;
  IF _unit_id IS NOT NULL THEN');
 EXECUTE definition;
END $$;
