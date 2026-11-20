-- These screens already subscribe to these tables; include their changes in
-- the stream so clients do not depend exclusively on periodic reconciliation.
DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['user_roles','referrals','referral_status_history','referral_handover'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=target) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',target);
    END IF;
  END LOOP;
END $$;
ALTER TABLE public.user_roles REPLICA IDENTITY FULL;
