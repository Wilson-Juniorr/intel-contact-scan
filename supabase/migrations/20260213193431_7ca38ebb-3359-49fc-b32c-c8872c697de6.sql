-- Add semantic perception columns to whatsapp_messages
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS extracted_semantic_summary text,
  ADD COLUMN IF NOT EXISTS extracted_entities jsonb DEFAULT '{}'::jsonb;

-- Index for entity searches
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_entities ON public.whatsapp_messages USING GIN (extracted_entities) WHERE extracted_entities IS NOT NULL AND extracted_entities != '{}'::jsonb;