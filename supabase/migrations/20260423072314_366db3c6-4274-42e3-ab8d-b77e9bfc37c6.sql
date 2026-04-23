-- 1. Compliance default 24h
ALTER TABLE public.compliance_settings ALTER COLUMN ativo SET DEFAULT false;

-- 2. Tabela agent_persona_config
CREATE TABLE IF NOT EXISTS public.agent_persona_config (
  agent_slug text PRIMARY KEY REFERENCES public.agents_config(slug) ON DELETE CASCADE,
  nome_assistente text,
  nome_corretor text,
  nome_empresa text,
  cidade text DEFAULT 'São Paulo',
  segmento text DEFAULT 'planos de saúde e seguros',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_persona_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view persona config" ON public.agent_persona_config;
CREATE POLICY "Users view persona config"
  ON public.agent_persona_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users manage persona config" ON public.agent_persona_config;
CREATE POLICY "Users manage persona config"
  ON public.agent_persona_config FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);