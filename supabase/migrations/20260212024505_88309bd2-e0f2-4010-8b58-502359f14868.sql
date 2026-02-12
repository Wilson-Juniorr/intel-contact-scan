ALTER TABLE public.whatsapp_messages DROP CONSTRAINT whatsapp_messages_status_check;
ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_status_check CHECK (status = ANY (ARRAY['pending','sent','delivered','read','failed','received']));

-- Enable realtime for whatsapp_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;