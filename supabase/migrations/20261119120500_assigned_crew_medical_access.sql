-- Crew-only responders need the medical information for their assigned patient.
-- Care-circle membership alone still grants no access to medical records.
CREATE POLICY "Assigned crew read patient medical profiles" ON public.profiles
FOR SELECT TO authenticated USING (
 public.has_role(auth.uid(),'admin') OR (
  public.has_role(auth.uid(),'crew') AND EXISTS (
   SELECT 1 FROM public.alerts a WHERE a.patient_id=profiles.id
    AND a.responder_id=auth.uid() AND a.status NOT IN ('resolved','cancelled')
  )
 )
);
