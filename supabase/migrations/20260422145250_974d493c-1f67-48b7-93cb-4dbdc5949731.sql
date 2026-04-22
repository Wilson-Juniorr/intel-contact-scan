
-- Regras de distribuição
CREATE TABLE public.lead_distribution_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  prioridade integer NOT NULL DEFAULT 10,
  ativo boolean NOT NULL DEFAULT true,
  -- Filtros (todos opcionais, AND entre eles)
  filtro_tipo text[] DEFAULT '{}',           -- PF, PJ, PME
  filtro_origem text[] DEFAULT '{}',          -- whatsapp, manual, importacao, ocr
  filtro_estagio text[] DEFAULT '{}',         -- novo, qualificacao, etc
  filtro_palavras_chave text[] DEFAULT '{}',  -- palavras na primeira msg
  -- Destino
  agente_alvo text,                            -- slug do agent (NULL = humano)
  agentes_pool text[] DEFAULT '{}',            -- pool para round-robin
  modo_distribuicao text NOT NULL DEFAULT 'fixo', -- fixo | round_robin | menos_carga
  -- Janela de funcionamento
  horario_inicio time DEFAULT '00:00',
  horario_fim time DEFAULT '23:59',
  dias_semana integer[] DEFAULT '{0,1,2,3,4,5,6}', -- 0=domingo
  fora_horario_acao text NOT NULL DEFAULT 'agendar', -- agendar | humano | ignorar
  -- Limites
  max_leads_dia integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_distribution_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read rules" ON public.lead_distribution_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/supervisor manage rules" ON public.lead_distribution_rules
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'supervisor'::app_role));

CREATE TRIGGER trg_dist_rules_updated
  BEFORE UPDATE ON public.lead_distribution_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Estado de round-robin
CREATE TABLE public.lead_distribution_state (
  rule_id uuid PRIMARY KEY REFERENCES public.lead_distribution_rules(id) ON DELETE CASCADE,
  ultimo_indice integer NOT NULL DEFAULT 0,
  contador_dia integer NOT NULL DEFAULT 0,
  data_contador date NOT NULL DEFAULT CURRENT_DATE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_distribution_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read state" ON public.lead_distribution_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service manage state" ON public.lead_distribution_state FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Log de roteamento
CREATE TABLE public.lead_routing_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid,
  rule_id uuid,
  rule_nome text,
  agente_escolhido text,
  motivo text,
  contexto jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_routing_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read routing log" ON public.lead_routing_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service insert routing log" ON public.lead_routing_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_routing_log_lead ON public.lead_routing_log(lead_id);
CREATE INDEX idx_routing_log_created ON public.lead_routing_log(created_at DESC);
CREATE INDEX idx_dist_rules_ativo_prio ON public.lead_distribution_rules(ativo, prioridade DESC);

-- Seed: regra default fora-horário
INSERT INTO public.lead_distribution_rules (nome, descricao, prioridade, agente_alvo, modo_distribuicao, horario_inicio, horario_fim, fora_horario_acao)
VALUES
  ('Camila SDR — Horário Comercial', 'Roteia todos os leads novos para Camila durante horário comercial', 100, 'camila-sdr', 'fixo', '08:00', '20:00', 'agendar'),
  ('Fora de Expediente — Agendar', 'Fora do horário, agenda contato no próximo dia útil', 50, NULL, 'fixo', '20:00', '08:00', 'agendar');
