-- Supabase exposes tables in "public" through its Data API. Turn on row level security with no
-- policies so that API can read nothing. The app connects as the table owner, which bypasses RLS.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
