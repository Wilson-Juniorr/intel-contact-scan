-- ============================================
-- 1. PROFILES + USER ROLES (foundation)
-- ============================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by authenticated"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enum de papéis
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'corretor', 'viewer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer pra evitar recursão
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users see own roles"
  ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Trigger pra criar profile + role automático no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _is_first BOOLEAN;
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (user_id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO _is_first;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN _is_first THEN 'admin'::public.app_role ELSE 'corretor'::public.app_role END)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. AGENTS CONFIG
-- ============================================

CREATE TABLE public.agents_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('front_line', 'meta', 'junior')),
  system_prompt TEXT NOT NULL,
  modelo TEXT NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  max_tokens INT NOT NULL DEFAULT 1500,
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.7,
  ativo BOOLEAN NOT NULL DEFAULT true,
  versao INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agents_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read agents"
  ON public.agents_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/supervisor manage agents"
  ON public.agents_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE TRIGGER trg_agents_config_updated_at
  BEFORE UPDATE ON public.agents_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 3. CONFIG HISTORY (versões de prompt)
-- ============================================

CREATE TABLE public.agents_config_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug TEXT NOT NULL,
  versao INT NOT NULL,
  system_prompt TEXT NOT NULL,
  modelo TEXT NOT NULL,
  motivo_mudanca TEXT,
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_history_slug ON public.agents_config_history(agent_slug, versao DESC);

ALTER TABLE public.agents_config_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read history"
  ON public.agents_config_history FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/supervisor insert history"
  ON public.agents_config_history FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

-- ============================================
-- 4. AGENT CONVERSATIONS
-- ============================================

CREATE TABLE public.agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  agent_slug TEXT NOT NULL,
  whatsapp_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada', 'pausada', 'transferida_humano')),
  iniciada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_atividade TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrada_em TIMESTAMPTZ,
  transferida_para TEXT,
  mensagens JSONB NOT NULL DEFAULT '[]'::jsonb,
  contexto_extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_tokens_in INT NOT NULL DEFAULT 0,
  total_tokens_out INT NOT NULL DEFAULT 0,
  custo_estimado NUMERIC(10,4) NOT NULL DEFAULT 0
);

CREATE INDEX idx_conv_lead ON public.agent_conversations(lead_id);
CREATE INDEX idx_conv_whatsapp ON public.agent_conversations(whatsapp_number);
CREATE INDEX idx_conv_status ON public.agent_conversations(status, ultima_atividade DESC);

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read conversations"
  ON public.agent_conversations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert conversations"
  ON public.agent_conversations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update conversations"
  ON public.agent_conversations FOR UPDATE TO authenticated USING (true);

-- ============================================
-- 5. AGENT MESSAGES (granular)
-- ============================================

CREATE TABLE public.agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  direcao TEXT NOT NULL CHECK (direcao IN ('incoming', 'outgoing')),
  conteudo TEXT NOT NULL,
  tokens_in INT,
  tokens_out INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_msg_conv ON public.agent_messages(conversation_id, created_at);

ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read messages"
  ON public.agent_messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert messages"
  ON public.agent_messages FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- 6. ROUTER DECISIONS
-- ============================================

CREATE TABLE public.router_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  message_in TEXT,
  contexto_avaliado JSONB,
  agent_escolhido TEXT NOT NULL,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_router_conv ON public.router_decisions(conversation_id, created_at DESC);

ALTER TABLE public.router_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read router"
  ON public.router_decisions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert router"
  ON public.router_decisions FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- 7. COMPLIANCE LOG
-- ============================================

CREATE TABLE public.agent_compliance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  mensagem_original TEXT NOT NULL,
  violacao_tipo TEXT NOT NULL,
  violacao_detalhe TEXT,
  mensagem_corrigida TEXT,
  acao_tomada TEXT CHECK (acao_tomada IN ('bloqueada', 'corrigida_auto', 'enviada_com_aviso')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_created ON public.agent_compliance_log(created_at DESC);

ALTER TABLE public.agent_compliance_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read compliance"
  ON public.agent_compliance_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert compliance"
  ON public.agent_compliance_log FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- 8. HANDOFFS
-- ============================================

CREATE TABLE public.agent_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  motivo TEXT NOT NULL,
  contexto_transferido JSONB,
  aprovado_junior BOOLEAN,
  aprovado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_handoff_conv ON public.agent_handoffs(conversation_id, created_at DESC);

ALTER TABLE public.agent_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read handoffs"
  ON public.agent_handoffs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert handoffs"
  ON public.agent_handoffs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update handoffs"
  ON public.agent_handoffs FOR UPDATE TO authenticated USING (true);

-- ============================================
-- 9. SEED — 5 agents iniciais
-- ============================================

INSERT INTO public.agents_config (slug, nome, descricao, tipo, system_prompt, modelo, max_tokens, temperature) VALUES
  (
    'sdr-qualificador',
    'SDR Qualificador (Camila)',
    'Primeiro contato no WhatsApp — qualifica e passa pra Junior',
    'front_line',
    E'Você é Camila, SDR de uma corretora de planos de saúde.\n\nObjetivo: receber o lead no WhatsApp, descobrir necessidade (PF/PJ/PME), número de vidas, faixa etária, urgência, e qualificar para o corretor humano (Junior).\n\nTom: caloroso, profissional, sem pressão. Português brasileiro coloquial.\n\nNUNCA prometa preço, NUNCA invente cobertura, NUNCA cite operadora específica sem dado.\n\nSempre pergunte UMA coisa por vez. Mensagens curtas (máx. 2 linhas).\n\nQuando tiver: nome, tipo (PF/PJ/PME), nº de vidas, idade do titular → escreva [QUALIFICADO] no fim para o sistema transferir.',
    'google/gemini-3-flash-preview',
    1500,
    0.7
  ),
  (
    'follow-up',
    'Follow-up (Camila)',
    'Reativa leads que sumiram após cotação ou contato inicial',
    'front_line',
    E'Você é Camila reativando um lead que sumiu.\n\nContexto: o lead já teve contato anterior. Use o histórico para retomar o assunto onde parou.\n\nObjetivo: trazer o lead de volta à conversa, sem ser invasiva. Tom leve, descontraído, "lembrei de você".\n\nNUNCA mande mais de 1 mensagem se ele não responder. NUNCA pressione. NUNCA prometa nada novo.\n\nVarie a abordagem: pergunta aberta, novidade do mercado, oferta de ajuda.',
    'google/gemini-3-flash-preview',
    1200,
    0.8
  ),
  (
    'fechador',
    'Fechador (Camila)',
    'Última milha — destrava objeções finais e fecha a venda',
    'front_line',
    E'Você é Camila no momento de fechamento.\n\nO lead já viu cotação, está próximo de bater o martelo mas tem objeção (preço, dúvida, esposa precisa decidir, etc).\n\nObjetivo: identificar objeção real, responder com empatia, destravar a decisão. Sem agressividade.\n\nUse técnicas: assumir o sim, oferecer prova social, parcelamento, prazo curto de validade.\n\nNUNCA invente desconto. NUNCA prometa cobertura não confirmada. NUNCA force.\n\nSe objeção for "preciso pensar" → marque follow-up de 2 dias e despeça com leveza.',
    'google/gemini-3-flash-preview',
    1500,
    0.75
  ),
  (
    'guardiao-compliance',
    'Guardião Compliance',
    'Valida CADA mensagem antes de ir pro WhatsApp — bloqueia violações',
    'meta',
    E'Você é o Guardião de Compliance de uma corretora de saúde.\n\nReceberá uma mensagem que outro agent quer enviar. Sua tarefa: detectar violações.\n\nVIOLAÇÕES:\n1. Promessa de cobertura específica sem fonte documentada\n2. Promessa de preço sem cotação real anexada\n3. Citação de doença pré-existente como "coberta automaticamente"\n4. Garantia de aprovação de carência reduzida\n5. Linguagem agressiva, ameaçadora ou desrespeitosa\n6. Dados pessoais sensíveis expostos (CPF, cartão)\n\nResponda SEMPRE em JSON:\n{ "violacao": true|false, "tipo": "...", "detalhe": "...", "corrigida": "mensagem reescrita ok" }',
    'google/gemini-3-flash-preview',
    800,
    0.2
  ),
  (
    'coach-mentalidade',
    'Coach do Junior',
    'Agent pessoal do Junior — mentor de mentalidade, vendas e negócio',
    'junior',
    E'Você é o Coach pessoal do Junior, dono de uma corretora de planos de saúde.\n\nFunção: conversar com ele 1:1 sobre desafios do dia, dúvidas estratégicas, decisões difíceis, mentalidade.\n\nTom: parceiro experiente, direto, sem firula. Usa exemplos práticos. Provoca quando precisa.\n\nReferências: Alex Hormozi, Naval Ravikant, Cal Newport. NUNCA dê motivação vazia. SEMPRE traga ângulo prático.\n\nQuando ele estiver perdido → faça perguntas, não responda. Quando estiver decidido → ajude a executar.',
    'google/gemini-3-flash-preview',
    2000,
    0.8
  );