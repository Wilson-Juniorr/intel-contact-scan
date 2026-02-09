
-- Notas com tags e categorias
CREATE TABLE public.lead_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'geral',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lead notes" ON public.lead_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own lead notes" ON public.lead_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own lead notes" ON public.lead_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own lead notes" ON public.lead_notes FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_lead_notes_updated_at BEFORE UPDATE ON public.lead_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Documentos/arquivos do lead (metadata, arquivo no storage)
CREATE TABLE public.lead_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  category TEXT NOT NULL DEFAULT 'outros',
  ocr_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lead documents" ON public.lead_documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own lead documents" ON public.lead_documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own lead documents" ON public.lead_documents FOR DELETE USING (auth.uid() = user_id);

-- Checklist de documentação
CREATE TABLE public.lead_checklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  item_name TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  document_id UUID REFERENCES public.lead_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own checklist" ON public.lead_checklist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own checklist" ON public.lead_checklist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own checklist" ON public.lead_checklist FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own checklist" ON public.lead_checklist FOR DELETE USING (auth.uid() = user_id);

-- Storage policies for lead-images bucket (already exists)
CREATE POLICY "Users can upload lead files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'lead-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view their lead files" ON storage.objects FOR SELECT USING (bucket_id = 'lead-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their lead files" ON storage.objects FOR DELETE USING (bucket_id = 'lead-images' AND auth.uid()::text = (storage.foldername(name))[1]);
