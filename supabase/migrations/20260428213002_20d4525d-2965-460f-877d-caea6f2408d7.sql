-- ═══ 1. mente_usage_log ═══
CREATE TABLE public.mente_usage_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID,
  agent_slug TEXT NOT NULL,
  turn_number INTEGER NOT NULL DEFAULT 1,
  cerebro_declarado TEXT,
  tecnica_declarada TEXT,
  cerebro_id UUID,
  tecnica_id UUID,
  semantic_approved BOOLEAN,
  semantic_confidence NUMERIC,
  semantic_reason TEXT,
  evidencia_trecho TEXT,
  resposta_final TEXT,
  ultima_msg_cliente TEXT,
  tom_cliente TEXT,
  campaign_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mente_usage_agent_created ON public.mente_usage_log (agent_slug, created_at DESC);
CREATE INDEX idx_mente_usage_cerebro ON public.mente_usage_log (cerebro_declarado);
CREATE INDEX idx_mente_usage_conversation ON public.mente_usage_log (conversation_id);
CREATE INDEX idx_mente_usage_campaign ON public.mente_usage_log (campaign_id);

ALTER TABLE public.mente_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read mente usage" ON public.mente_usage_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service insert mente usage" ON public.mente_usage_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- ═══ 2. campaign_triggers ═══
CREATE TABLE public.campaign_triggers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  agent_slug TEXT NOT NULL DEFAULT 'sdr-qualificador',
  -- Detecção
  utm_codes TEXT[] DEFAULT '{}'::text[],
  trigger_phrases TEXT[] DEFAULT '{}'::text[],
  fuzzy_threshold NUMERIC NOT NULL DEFAULT 0.7,
  -- Preset que vira contexto pré-preenchido
  preset_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Perguntas que o SDR deve pular (elementos de "falta")
  skip_questions TEXT[] DEFAULT '{}'::text[],
  -- Mensagem de abertura customizada (opcional, sobrescreve saudação)
  opening_message TEXT,
  -- Mentes/técnicas preferidas (ids de vendor_profiles e sales_techniques)
  preferred_brain_ids UUID[] DEFAULT '{}'::uuid[],
  preferred_technique_ids UUID[] DEFAULT '{}'::uuid[],
  -- Métricas
  detection_count INTEGER NOT NULL DEFAULT 0,
  qualified_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaign_triggers_ativo ON public.campaign_triggers (ativo, agent_slug);

ALTER TABLE public.campaign_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read campaigns" ON public.campaign_triggers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/supervisor manage campaigns triggers" ON public.campaign_triggers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

CREATE TRIGGER update_campaign_triggers_updated_at
  BEFORE UPDATE ON public.campaign_triggers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ 3. campaign_lead_attributions ═══
CREATE TABLE public.campaign_lead_attributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL,
  lead_id UUID,
  conversation_id UUID,
  detection_method TEXT NOT NULL, -- 'utm' | 'phrase_exact' | 'phrase_fuzzy'
  detection_confidence NUMERIC,
  matched_value TEXT,
  qualificou BOOLEAN NOT NULL DEFAULT false,
  qualificou_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attribution_campaign ON public.campaign_lead_attributions (campaign_id, created_at DESC);
CREATE INDEX idx_attribution_lead ON public.campaign_lead_attributions (lead_id);

ALTER TABLE public.campaign_lead_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read attributions" ON public.campaign_lead_attributions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service insert attributions" ON public.campaign_lead_attributions
  FOR INSERT TO authenticated WITH CHECK (true);