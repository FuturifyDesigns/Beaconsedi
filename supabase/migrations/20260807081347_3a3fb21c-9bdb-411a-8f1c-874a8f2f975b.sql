-- Live location telemetry + triage + test mode on alerts
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS heading double precision,
  ADD COLUMN IF NOT EXISTS speed double precision,
  ADD COLUMN IF NOT EXISTS altitude double precision,
  ADD COLUMN IF NOT EXISTS location_source text,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_sharing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS priority_reason text,
  ADD COLUMN IF NOT EXISTS patient_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS triage jsonb;

-- Coordinate validity guard
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_coords_valid;
ALTER TABLE public.alerts ADD CONSTRAINT alerts_coords_valid
  CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);

CREATE INDEX IF NOT EXISTS alerts_status_priority_idx ON public.alerts (status, priority, created_at DESC);

-- Incident messaging between dispatchers, responders and patients
CREATE TABLE IF NOT EXISTS public.incident_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_label text,
  sender_role text NOT NULL DEFAULT 'dispatcher',
  recipient_role text NOT NULL DEFAULT 'responder',
  body text NOT NULL,
  urgent boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incident_messages_alert_idx ON public.incident_messages (alert_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.incident_messages TO authenticated;
GRANT ALL ON public.incident_messages TO service_role;

ALTER TABLE public.incident_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read incident messages" ON public.incident_messages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.alerts a WHERE a.id = incident_messages.alert_id AND a.patient_id = auth.uid())
  );

CREATE POLICY "Send incident messages" ON public.incident_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND (
      public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (SELECT 1 FROM public.alerts a WHERE a.id = incident_messages.alert_id AND a.patient_id = auth.uid())
    )
  );

CREATE POLICY "Mark incident messages read" ON public.incident_messages
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_messages;