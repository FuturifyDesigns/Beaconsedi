-- The roster must reflect a finished response even when it is closed from the crew app.
CREATE FUNCTION public.restore_staff_after_response() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE next_state text;
BEGIN
 IF NEW.status IN ('resolved','cancelled') AND OLD.status NOT IN ('resolved','cancelled') AND NEW.responder_id IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.alerts WHERE responder_id=NEW.responder_id AND id<>NEW.id AND status NOT IN ('resolved','cancelled'))
 AND NOT EXISTS(SELECT 1 FROM public.referrals r JOIN public.responder_units u ON u.id=r.unit_id WHERE u.user_id=NEW.responder_id AND r.status NOT IN ('completed','cancelled','declined')) THEN
   SELECT CASE WHEN status='on_break' THEN 'on_break' ELSE 'available' END INTO next_state FROM public.shifts WHERE user_id=NEW.responder_id AND ended_at IS NULL;
   UPDATE public.responder_profiles SET availability=coalesce(next_state,'offline') WHERE user_id=NEW.responder_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER restore_staff_after_response AFTER UPDATE OF status ON public.alerts FOR EACH ROW EXECUTE FUNCTION public.restore_staff_after_response();
