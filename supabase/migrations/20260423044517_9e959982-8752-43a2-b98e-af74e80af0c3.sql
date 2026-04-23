-- ═══ ONDA 1 — Schema (categorias + timeout manual + compliance) ═══

-- 1. Enum de categorias de contato
DO $$ BEGIN
  CREATE TYPE contact_category AS ENUM (
    'lead_novo','lead_retorno','personal','team','partner','vendor','spam','ambiguo'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Colunas em whatsapp_contacts
ALTER TABLE public.whatsapp_contacts
  ADD COLUMN IF NOT EXISTS category contact_category,
  ADD COLUMN IF NOT EXISTS category_confidence numeric(3,2),
  ADD COLUMN IF NOT EXISTS category_classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS category_source text CHECK (category_source IN ('manual','llm','bootstrap'));

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_category
  ON public.whatsapp_contacts(user_id, category);

-- 3. Histórico de classificações
CREATE TABLE IF NOT EXISTS public.conversation_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE,
  phone text NOT NULL,
  categoria contact_category NOT NULL,
  confianca numeric(3,2) NOT NULL,
  razao text,
  sinais text[],
  modelo text DEFAULT 'google/gemini-3-flash-preview',
  mensagens_analisadas int DEFAULT 0,
  overridden_by_junior boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.conversation_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own classifications" ON public.conversation_classifications;
CREATE POLICY "Users view own classifications"
  ON public.conversation_classifications FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service insert classifications" ON public.conversation_classifications;
CREATE POLICY "Service insert classifications"
  ON public.conversation_classifications FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_conv_class_contact
  ON public.conversation_classifications(contact_id, created_at DESC);

-- 4. Timeout manual conversation
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS assumed_by uuid;

CREATE OR REPLACE FUNCTION public.track_manual_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.in_manual_conversation = true AND (OLD.in_manual_conversation = false OR OLD.in_manual_conversation IS NULL) THEN
    NEW.assumed_at := now();
    IF NEW.assumed_by IS NULL THEN
      NEW.assumed_by := auth.uid();
    END IF;
  ELSIF NEW.in_manual_conversation = false AND OLD.in_manual_conversation = true THEN
    NEW.assumed_at := NULL;
    NEW.assumed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_manual_conversation ON public.leads;
CREATE TRIGGER trg_track_manual_conversation
  BEFORE UPDATE OF in_manual_conversation ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.track_manual_conversation();

-- 5. Compliance settings
CREATE TABLE IF NOT EXISTS public.compliance_settings (
  user_id uuid PRIMARY KEY,
  window_start time NOT NULL DEFAULT '08:00',
  window_end time NOT NULL DEFAULT '21:00',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  weekdays_only boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.compliance_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own compliance" ON public.compliance_settings;
CREATE POLICY "Users manage own compliance"
  ON public.compliance_settings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6. Scheduled messages queue
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  phone text NOT NULL,
  message text NOT NULL,
  agent_slug text,
  send_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','cancelled')),
  error text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own scheduled" ON public.scheduled_messages;
CREATE POLICY "Users view own scheduled"
  ON public.scheduled_messages FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users cancel own scheduled" ON public.scheduled_messages;
CREATE POLICY "Users cancel own scheduled"
  ON public.scheduled_messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_send_at
  ON public.scheduled_messages(status, send_at)
  WHERE status = 'queued';

-- 7. pg_cron jobs (extension already enabled)
DO $$ BEGIN
  PERFORM cron.unschedule('auto-unassume-manual-conversation');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'auto-unassume-manual-conversation',
  '*/15 * * * *',
  $cron$
  WITH desassumidos AS (
    UPDATE public.leads
    SET in_manual_conversation = false
    WHERE in_manual_conversation = true
      AND assumed_at IS NOT NULL
      AND assumed_at < now() - interval '24 hours'
    RETURNING id, user_id, assumed_at
  )
  INSERT INTO public.action_log (user_id, lead_id, action_type, metadata)
  SELECT user_id, id, 'auto_unassume_manual',
         jsonb_build_object('assumed_at', assumed_at, 'desassumido_em', now())
  FROM desassumidos;
  $cron$
);

-- Seed compliance pra usuários existentes
INSERT INTO public.compliance_settings (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;