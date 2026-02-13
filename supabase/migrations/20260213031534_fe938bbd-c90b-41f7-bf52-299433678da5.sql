
-- Add extracted_text and processing columns to whatsapp_messages
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS media_storage_path text;

-- Create lead_memory table
CREATE TABLE public.lead_memory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  summary text,
  structured_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(lead_id, user_id)
);

-- Enable RLS
ALTER TABLE public.lead_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lead memory"
  ON public.lead_memory FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own lead memory"
  ON public.lead_memory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lead memory"
  ON public.lead_memory FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lead memory"
  ON public.lead_memory FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_lead_memory_updated_at
  BEFORE UPDATE ON public.lead_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for lead_memory
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_memory;

-- Create storage bucket for whatsapp media
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for whatsapp-media bucket
CREATE POLICY "Users can upload their own whatsapp media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'whatsapp-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own whatsapp media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'whatsapp-media' AND auth.uid()::text = (storage.foldername(name))[1]);
