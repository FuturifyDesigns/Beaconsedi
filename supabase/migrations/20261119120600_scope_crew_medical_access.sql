-- has_role(...,'responder') also inherits crew in the original schema.
-- Keep the existing responder policy for explicit responders; crew-only access
-- must go through the assigned-active-incident policy approved by the owner.
ALTER POLICY "Users read own profile" ON public.profiles USING (
 auth.uid()=id OR EXISTS (
  SELECT 1 FROM public.user_roles r WHERE r.user_id=auth.uid() AND r.role='responder'
 )
);
