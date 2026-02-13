
-- Add lead_id to whatsapp_contacts
ALTER TABLE public.whatsapp_contacts ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_created ON public.whatsapp_messages(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_lead_id_created ON public.whatsapp_messages(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_user_phone ON public.whatsapp_contacts(user_id, phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_lead_id ON public.whatsapp_contacts(lead_id);
