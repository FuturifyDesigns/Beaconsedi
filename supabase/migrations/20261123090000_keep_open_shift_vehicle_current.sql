-- A role-page vehicle assignment applies to an already clocked-in crew too.
-- Keep the existing RPC's administrator checks, row locks and busy-vehicle guards.
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.admin_assign_responder_vehicle(uuid,text,uuid)'::regprocedure) INTO definition;
 IF position('UPDATE public.shifts SET unit_id = _unit_id' in definition) = 0 THEN
  definition := replace(definition,
   '  RETURN jsonb_build_object(''ok'', true, ''user_id'', _user_id, ''unit_id'', _unit_id);',
   '  UPDATE public.shifts SET unit_id = _unit_id WHERE user_id = _user_id AND ended_at IS NULL;
  RETURN jsonb_build_object(''ok'', true, ''user_id'', _user_id, ''unit_id'', _unit_id);');
  IF position('UPDATE public.shifts SET unit_id = _unit_id' in definition) = 0 THEN
   RAISE EXCEPTION 'Vehicle assignment function changed; review before updating';
  END IF;
  EXECUTE definition;
 END IF;
END $$;
