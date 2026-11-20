CREATE UNIQUE INDEX one_open_shift_per_staff_member ON public.shifts(user_id) WHERE ended_at IS NULL;

CREATE FUNCTION public.change_own_shift(_action text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE staff_id uuid:=auth.uid(); current_shift public.shifts%ROWTYPE; shift_id uuid;
 next_availability text; break_add integer:=0;
BEGIN
 IF staff_id IS NULL OR NOT (public.has_role(staff_id,'responder') OR public.has_role(staff_id,'admin')) THEN RAISE EXCEPTION 'Crew or responder access required'; END IF;
 IF _action IS NULL OR _action NOT IN ('clock_in','clock_out','break_start','break_end') THEN RAISE EXCEPTION 'Invalid shift action'; END IF;
 PERFORM 1 FROM auth.users WHERE id=staff_id FOR UPDATE;
 SELECT * INTO current_shift FROM public.shifts WHERE user_id=staff_id AND ended_at IS NULL FOR UPDATE;
 IF _action='clock_in' THEN
   IF current_shift.id IS NOT NULL THEN RETURN current_shift.id; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.responder_profiles WHERE user_id=staff_id AND nullif(btrim(full_name),'') IS NOT NULL) THEN RAISE EXCEPTION 'Save your team profile with your full name before clocking in'; END IF;
   INSERT INTO public.shifts(user_id,unit_id,status) SELECT staff_id,assigned_unit_id,'on_duty' FROM public.responder_profiles WHERE user_id=staff_id RETURNING id INTO shift_id;
   next_availability:='available';
 ELSE
   IF current_shift.id IS NULL THEN RAISE EXCEPTION 'You have no open shift. Refresh and try again.'; END IF;
   shift_id:=current_shift.id;
   IF _action IN ('clock_out','break_start') AND (
    EXISTS(SELECT 1 FROM public.alerts WHERE responder_id=staff_id AND status NOT IN ('resolved','cancelled')) OR
    EXISTS(SELECT 1 FROM public.referrals r JOIN public.responder_units u ON u.id=r.unit_id WHERE u.user_id=staff_id AND r.status NOT IN ('completed','cancelled','declined'))
   ) THEN RAISE EXCEPTION 'Finish or hand over your active response before going off duty or on break'; END IF;
   IF current_shift.break_started_at IS NOT NULL THEN break_add:=greatest(0,floor(extract(epoch FROM now()-current_shift.break_started_at))::integer); END IF;
   IF _action='clock_out' THEN
     UPDATE public.shifts SET ended_at=now(),break_started_at=null,break_seconds=break_seconds+break_add,status='completed' WHERE id=shift_id;
     next_availability:='offline';
   ELSIF _action='break_start' THEN
     IF current_shift.status<>'on_duty' THEN RAISE EXCEPTION 'You are already on break'; END IF;
     UPDATE public.shifts SET break_started_at=now(),status='on_break' WHERE id=shift_id;
     next_availability:='on_break';
   ELSE
     IF current_shift.status<>'on_break' OR current_shift.break_started_at IS NULL THEN RAISE EXCEPTION 'No break to end'; END IF;
     UPDATE public.shifts SET break_started_at=null,break_seconds=break_seconds+break_add,status='on_duty' WHERE id=shift_id;
     next_availability:='available';
   END IF;
 END IF;
 UPDATE public.responder_profiles SET availability=next_availability WHERE user_id=staff_id;
 INSERT INTO public.shift_events(shift_id,user_id,event_type) VALUES(shift_id,staff_id,_action);
 INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata) VALUES(staff_id,'shift_'||_action,'shift',shift_id::text,'{}');
 RETURN shift_id;
END $$;
REVOKE ALL ON FUNCTION public.change_own_shift(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.change_own_shift(text) TO authenticated;
-- Times, breaks and event records are written together by the server clock.
REVOKE INSERT,UPDATE,DELETE ON public.shifts FROM authenticated;
REVOKE INSERT ON public.shift_events FROM authenticated;

DROP POLICY "Own responder profile insert" ON public.responder_profiles;
CREATE POLICY "Own responder profile insert" ON public.responder_profiles FOR INSERT TO authenticated
 WITH CHECK(public.has_role(auth.uid(),'admin') OR (user_id=auth.uid() AND public.has_role(auth.uid(),'responder') AND assigned_unit_id IS NULL));

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['responder_profiles','shift_events'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=table_name) THEN
   EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',table_name);
  END IF;
 END LOOP;
END $$;

CREATE FUNCTION public.log_staff_availability() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.availability IS DISTINCT FROM OLD.availability THEN
  INSERT INTO public.shift_events(shift_id,user_id,event_type,note)
  SELECT id,NEW.user_id,'status_change',NEW.availability FROM public.shifts WHERE user_id=NEW.user_id AND ended_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER staff_availability_timeline AFTER UPDATE OF availability ON public.responder_profiles FOR EACH ROW EXECUTE FUNCTION public.log_staff_availability();
