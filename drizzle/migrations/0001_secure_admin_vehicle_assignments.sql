CREATE UNIQUE INDEX IF NOT EXISTS responder_profiles_one_responder_per_unit
  ON public.responder_profiles (assigned_unit_id)
  WHERE assigned_unit_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS responder_units_one_unit_per_user
  ON public.responder_units (user_id)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.protect_responder_vehicle_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.assigned_unit_id IS DISTINCT FROM NEW.assigned_unit_id
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only an administrator can change a vehicle assignment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_responder_vehicle_assignment ON public.responder_profiles;
CREATE TRIGGER protect_responder_vehicle_assignment
  BEFORE UPDATE OF assigned_unit_id ON public.responder_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_responder_vehicle_assignment();

CREATE OR REPLACE FUNCTION public.admin_assign_responder_vehicle(
  _user_id uuid,
  _email text,
  _unit_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_unit_id uuid;
  _unit public.responder_units%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  IF NOT public.has_role(_user_id, 'responder') THEN
    RAISE EXCEPTION 'Vehicle assignments are limited to users with the responder role';
  END IF;

  SELECT assigned_unit_id INTO _old_unit_id
  FROM public.responder_profiles
  WHERE user_id = _user_id
  FOR UPDATE;

  IF _unit_id IS NOT NULL THEN
    SELECT * INTO _unit
    FROM public.responder_units
    WHERE id = _unit_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Vehicle not found';
    END IF;

    IF _unit.user_id IS NOT NULL AND _unit.user_id <> _user_id THEN
      RAISE EXCEPTION 'This vehicle is already assigned to another responder';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.responder_profiles
      WHERE assigned_unit_id = _unit_id AND user_id <> _user_id
    ) THEN
      RAISE EXCEPTION 'This vehicle is already assigned to another responder';
    END IF;
  END IF;

  INSERT INTO public.responder_profiles (user_id, email, assigned_unit_id)
  VALUES (_user_id, NULLIF(lower(trim(_email)), ''), _unit_id)
  ON CONFLICT (user_id) DO UPDATE
    SET email = COALESCE(public.responder_profiles.email, EXCLUDED.email),
        assigned_unit_id = EXCLUDED.assigned_unit_id,
        updated_at = now();

  UPDATE public.responder_units
  SET user_id = NULL
  WHERE user_id = _user_id AND id IS DISTINCT FROM _unit_id;

  IF _old_unit_id IS NOT NULL AND _old_unit_id IS DISTINCT FROM _unit_id THEN
    UPDATE public.responder_units
    SET user_id = NULL
    WHERE id = _old_unit_id AND user_id = _user_id;
  END IF;

  IF _unit_id IS NOT NULL THEN
    UPDATE public.responder_units
    SET user_id = _user_id
    WHERE id = _unit_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(),
    CASE WHEN _unit_id IS NULL THEN 'vehicle_unassigned' ELSE 'vehicle_assigned' END,
    'responder_profile',
    _user_id::text,
    jsonb_build_object('responder_email', lower(trim(_email)), 'previous_unit_id', _old_unit_id, 'unit_id', _unit_id)
  );

  RETURN jsonb_build_object('ok', true, 'user_id', _user_id, 'unit_id', _unit_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_responder_vehicle(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_assign_responder_vehicle(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_responder_vehicle(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_responder_vehicle(uuid, text, uuid) TO service_role;