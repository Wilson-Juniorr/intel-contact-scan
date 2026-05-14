ALTER TABLE public.whatsapp_contacts
  ADD COLUMN IF NOT EXISTS opted_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_opted_out
  ON public.whatsapp_contacts (user_id, phone)
  WHERE opted_out = true;