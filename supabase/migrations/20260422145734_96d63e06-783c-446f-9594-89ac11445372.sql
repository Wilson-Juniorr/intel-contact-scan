
CREATE TABLE public.rewarming_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  agente_slug text NOT NULL,
  -- Critérios de elegibilidade
  dias_inativo_min integer NOT NULL DEFAULT 14,
  estagios_alvo text[] DEFAULT '{cotacao_enviada,qualificacao,sem_retorno}',
  excluir_perdidos boolean NOT NULL DEFAULT true,
  filtro_tipo text[] DEFAULT '{}',
  -- Cadência
  max_tentativas integer NOT NULL DEFAULT 3,
  intervalo_dias integer NOT NULL DEFAULT 7,
  horario_envio time NOT NULL DEFAULT '10:00',
  dias_semana integer[] DEFAULT '{1,2,3,4,5}',
  -- Templates de mensagem por tentativa (array de strings)
  mensagens_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Tom e abordagem
  tom text DEFAULT 'consultivo',
  objetivo text DEFAULT 'reabrir_conversa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rewarming_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read campaigns" ON public.rewarming_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/supervisor manage campaigns" ON public.rewarming_campaigns FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'supervisor'::app_role));
CREATE TRIGGER trg_rewarming_campaigns_upd BEFORE UPDATE ON public.rewarming_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.rewarming_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL REFERENCES public.rewarming_campaigns(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ativo', -- ativo | respondeu | desistiu | concluido | pausado
  tentativas_feitas integer NOT NULL DEFAULT 0,
  proxima_execucao timestamptz NOT NULL DEFAULT now(),
  ultima_resposta_em timestamptz,
  motivo_saida text,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id, campaign_id)
);
ALTER TABLE public.rewarming_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own pool" ON public.rewarming_pool FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users manage own pool" ON public.rewarming_pool FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_rewarming_pool_proxima ON public.rewarming_pool(proxima_execucao) WHERE status = 'ativo';
CREATE INDEX idx_rewarming_pool_lead ON public.rewarming_pool(lead_id);
CREATE TRIGGER trg_rewarming_pool_upd BEFORE UPDATE ON public.rewarming_pool FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.rewarming_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid REFERENCES public.rewarming_pool(id) ON DELETE CASCADE,
  lead_id uuid,
  user_id uuid NOT NULL,
  tentativa integer NOT NULL,
  mensagem text,
  status text NOT NULL DEFAULT 'enviado',
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rewarming_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own log" ON public.rewarming_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service insert log" ON public.rewarming_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX idx_rewarming_log_pool ON public.rewarming_log(pool_id);

-- Seed: campanha default
INSERT INTO public.rewarming_campaigns (nome, descricao, agente_slug, dias_inativo_min, max_tentativas, intervalo_dias, mensagens_template)
VALUES (
  'Reaquecimento Padrão — 14 dias',
  'Reaquece leads parados há 14+ dias com cadência semanal',
  'camila-sdr', 14, 3, 7,
  '[
    "Oi {{nome}}! Vi que conversamos há um tempinho sobre plano de saúde. Como posso te ajudar hoje? 😊",
    "Oi {{nome}}, tudo bem? Lembrei de você e queria saber se ainda faz sentido conversarmos sobre aquela cotação?",
    "Oi {{nome}}! Última vez que te chamo por aqui — caso queira retomar, é só responder. Abs!"
  ]'::jsonb
);
