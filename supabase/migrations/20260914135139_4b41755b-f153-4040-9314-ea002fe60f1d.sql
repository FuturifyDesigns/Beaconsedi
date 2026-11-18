ALTER TABLE public.incident_messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_path text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS listened_at timestamptz;

CREATE POLICY "Patients update own incident messages"
ON public.incident_messages FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.alerts a WHERE a.id = incident_messages.alert_id AND a.patient_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.alerts a WHERE a.id = incident_messages.alert_id AND a.patient_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.can_access_incident(_alert_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.alerts a WHERE a.id = _alert_id AND a.patient_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.can_access_incident(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_access_incident(uuid) TO authenticated;

CREATE POLICY "Incident participants upload voice notes"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'voice-notes'
  AND public.can_access_incident(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Incident participants read voice notes"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'voice-notes'
  AND public.can_access_incident(((storage.foldername(name))[1])::uuid)
);