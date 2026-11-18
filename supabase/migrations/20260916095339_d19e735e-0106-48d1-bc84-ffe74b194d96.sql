CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'navigate360',
  event_type TEXT NOT NULL,
  incident_id UUID REFERENCES public.alerts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'outbound',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.integration_events TO authenticated;
GRANT ALL ON public.integration_events TO service_role;
ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view integration events"
ON public.integration_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_integration_events_status ON public.integration_events (status, created_at);
CREATE INDEX IF NOT EXISTS idx_integration_events_incident ON public.integration_events (incident_id);

CREATE TABLE IF NOT EXISTS public.navigate360_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL UNIQUE REFERENCES public.alerts(id) ON DELETE CASCADE,
  external_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.navigate360_incidents TO authenticated;
GRANT ALL ON public.navigate360_incidents TO service_role;
ALTER TABLE public.navigate360_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view navigate360 incident links"
ON public.navigate360_incidents FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'responder') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER integration_events_updated_at
BEFORE UPDATE ON public.integration_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER navigate360_incidents_updated_at
BEFORE UPDATE ON public.navigate360_incidents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();