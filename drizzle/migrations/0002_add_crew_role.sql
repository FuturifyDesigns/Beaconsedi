ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'crew';

-- Crew members inherit every responder permission (incident access, vehicle assignment, GPS pings).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = _role OR (_role::text = 'responder' AND role::text = 'crew'))
  );
$function$;