ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS transcription_confidence numeric;