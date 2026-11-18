INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('voice-notes', 'voice-notes', false, 10485760)
ON CONFLICT (id) DO NOTHING;
