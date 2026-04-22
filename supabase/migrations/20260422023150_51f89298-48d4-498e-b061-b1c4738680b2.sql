-- Habilita Realtime em agent_conversations (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'agent_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_conversations;
  END IF;
END $$;

ALTER TABLE public.agent_conversations REPLICA IDENTITY FULL;