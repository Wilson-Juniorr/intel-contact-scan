
-- Tabela para armazenar TODAS as mensagens do WhatsApp (enviadas e recebidas)
CREATE TABLE public.whatsapp_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'audio', 'image', 'document', 'video', 'sticker')),
  content TEXT,
  media_url TEXT,
  uazapi_message_id TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para buscas rápidas
CREATE INDEX idx_whatsapp_messages_lead_id ON public.whatsapp_messages(lead_id);
CREATE INDEX idx_whatsapp_messages_phone ON public.whatsapp_messages(phone);
CREATE INDEX idx_whatsapp_messages_created_at ON public.whatsapp_messages(created_at DESC);

-- RLS
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own messages"
ON public.whatsapp_messages FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messages"
ON public.whatsapp_messages FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own messages"
ON public.whatsapp_messages FOR UPDATE
USING (auth.uid() = user_id);

-- Tabela para fila de follow-ups agendados
CREATE TABLE public.follow_up_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  message_content TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_follow_up_queue_status ON public.follow_up_queue(status, scheduled_at);
CREATE INDEX idx_follow_up_queue_lead_id ON public.follow_up_queue(lead_id);

-- RLS
ALTER TABLE public.follow_up_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own follow ups"
ON public.follow_up_queue FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own follow ups"
ON public.follow_up_queue FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own follow ups"
ON public.follow_up_queue FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own follow ups"
ON public.follow_up_queue FOR DELETE
USING (auth.uid() = user_id);
