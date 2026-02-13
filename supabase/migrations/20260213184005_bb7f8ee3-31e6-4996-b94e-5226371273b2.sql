
-- Add message classification columns to whatsapp_messages
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS message_category text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS business_relevance_score numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intent text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS classification_confidence text DEFAULT 'low';

-- Add index for relevance filtering
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_relevance ON public.whatsapp_messages (business_relevance_score) WHERE business_relevance_score >= 0.6;
