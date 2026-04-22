-- ONDA 1: Vendor Profiles + Sales Techniques (Biblioteca de Cérebros)
-- Fundação para componer agentes (Camila e futuros) a partir de perfis de vendedor + técnicas de venda reutilizáveis

-- =====================================================================
-- 1. vendor_profiles — "Cérebros" de vendedores lendários
-- =====================================================================
CREATE TABLE public.vendor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  origem text,                      -- "Chris Voss (FBI)", "Werner Braun (BR)", etc
  descricao text,                   -- breve resumo do que esse cérebro traz
  tom text,                         -- "calmo e cirúrgico", "energético", etc
  estilo text,                      -- como ele escreve/fala
  principios text,                  -- princípios-chave (texto livre, vai virar parte do prompt)
  exemplos_frases jsonb NOT NULL DEFAULT '[]'::jsonb,  -- array de frases icônicas
  quando_usar text,                 -- "use quando o lead está hesitante", etc
  evitar_quando text,               -- "evite quando lead já decidiu", etc
  tags text[] NOT NULL DEFAULT '{}',
  cor_hex text DEFAULT '#3B82F6',   -- cor pro chip na UI
  icone text DEFAULT 'Brain',       -- nome do icone lucide
  ativo boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read vendor_profiles"
  ON public.vendor_profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/supervisor manage vendor_profiles"
  ON public.vendor_profiles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

CREATE TRIGGER set_updated_at_vendor_profiles
  BEFORE UPDATE ON public.vendor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 2. sales_techniques — Técnicas reutilizáveis (Mirroring, SPIN, etc)
-- =====================================================================
CREATE TABLE public.sales_techniques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  categoria text NOT NULL,          -- 'rapport', 'descoberta', 'objecao', 'fechamento', 'urgencia'
  descricao text,
  como_aplicar text NOT NULL,       -- instruções que entram no prompt
  exemplos jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{situacao, cliente, agente}]
  gatilho_uso text,                 -- "quando cliente diz 'tô só pesquisando'"
  fonte_autor text,                 -- "Chris Voss", "Neil Rackham", etc
  nivel_dificuldade int NOT NULL DEFAULT 2,  -- 1=básica, 5=avançada
  cor_hex text DEFAULT '#8B5CF6',
  icone text DEFAULT 'Sparkles',
  ativo boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_techniques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read sales_techniques"
  ON public.sales_techniques FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/supervisor manage sales_techniques"
  ON public.sales_techniques FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

CREATE TRIGGER set_updated_at_sales_techniques
  BEFORE UPDATE ON public.sales_techniques
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 3. agent_vendor_profiles — junction (qual agent usa quais cérebros)
-- =====================================================================
CREATE TABLE public.agent_vendor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug text NOT NULL,                 -- referencia agents_config.slug
  vendor_profile_id uuid NOT NULL REFERENCES public.vendor_profiles(id) ON DELETE CASCADE,
  peso int NOT NULL DEFAULT 5,              -- 1-10 (quanto esse cérebro influencia)
  notas text,                                -- "use principalmente em descoberta"
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_slug, vendor_profile_id)
);

ALTER TABLE public.agent_vendor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read agent_vendor_profiles"
  ON public.agent_vendor_profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/supervisor manage agent_vendor_profiles"
  ON public.agent_vendor_profiles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- =====================================================================
-- 4. agent_techniques — junction (qual agent usa quais técnicas)
-- =====================================================================
CREATE TABLE public.agent_techniques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug text NOT NULL,
  technique_id uuid NOT NULL REFERENCES public.sales_techniques(id) ON DELETE CASCADE,
  prioridade int NOT NULL DEFAULT 5,        -- ordem de uso (1=primeiro tentar)
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_slug, technique_id)
);

ALTER TABLE public.agent_techniques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read agent_techniques"
  ON public.agent_techniques FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/supervisor manage agent_techniques"
  ON public.agent_techniques FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- =====================================================================
-- 5. Indexes
-- =====================================================================
CREATE INDEX idx_vendor_profiles_ativo ON public.vendor_profiles(ativo) WHERE ativo = true;
CREATE INDEX idx_sales_techniques_categoria ON public.sales_techniques(categoria) WHERE ativo = true;
CREATE INDEX idx_agent_vendor_profiles_slug ON public.agent_vendor_profiles(agent_slug);
CREATE INDEX idx_agent_techniques_slug ON public.agent_techniques(agent_slug);

-- =====================================================================
-- 6. SEED — Vendor Profiles (4 cérebros principais que a Camila usa)
-- =====================================================================
INSERT INTO public.vendor_profiles (slug, nome, origem, descricao, tom, estilo, principios, exemplos_frases, quando_usar, evitar_quando, tags, cor_hex, icone, is_default) VALUES
('chris-voss',
 'Chris Voss',
 'Negociador FBI (EUA) — autor de "Never Split the Difference"',
 'Mestre da empatia tática. Usa Mirroring (espelhamento) e Labeling (rotulagem emocional) pra criar conexão profunda em poucas palavras.',
 'calmo, curioso, cirúrgico — voz de DJ noturno',
 'Pergunta mais do que afirma. Usa "parece que…", "soa como…", repete as últimas 1-3 palavras do cliente em forma de pergunta.',
 E'1. MIRRORING: repita as últimas 1-3 palavras do cliente como pergunta. Isso faz ele continuar falando.\n2. LABELING: nomeie a emoção dele. "Parece que você tá com pressa", "Soa como se já tivesse tido uma experiência ruim antes".\n3. PERGUNTAS CALIBRADAS: troque "por que?" (acusatório) por "como?" e "o que?" (cooperativo).\n4. NÃO TÁ TUDO BEM ≠ NÃO. Quando cliente diz "não", muitas vezes é "ainda não entendi". Continue a conversa.\n5. SILÊNCIO É ARMA. Depois de uma pergunta boa, espere.',
 '["Parece que você tá num momento delicado…", "Soa como se você já tivesse passado por isso antes — me conta?", "Como eu posso te ajudar a resolver isso hoje?", "O que precisa acontecer pra isso fazer sentido pra você?"]'::jsonb,
 'Lead resistente, hesitante, com objeção emocional, ou quando precisa entender o que ele REALMENTE quer (não o que ele diz que quer).',
 'Lead já decidido e querendo só fechar — aí é hora do Ortega.',
 ARRAY['rapport', 'descoberta', 'empatia', 'fbi'],
 '#3B82F6',
 'Headphones',
 true),

('werner-braun',
 'Werner Braun',
 'Especialista BR em vendas consultivas de alto valor',
 'Reframing brasileiro: pega objeção e devolve transformada. Foca em valor percebido, não preço.',
 'firme, direto, mas acolhedor — sem rodeio mas sem agredir',
 'Reframa toda objeção. Usa contraste (pintar o problema antes da solução). Fala em "investimento" não "gasto".',
 E'1. REFRAMING: toda objeção vira oportunidade. "Tá caro" → "caro comparado a quê?". "Vou pensar" → "o que falta pra decidir?".\n2. CONTRASTE: pinte o problema (consequência de não agir) ANTES de mostrar a solução.\n3. VALOR > PREÇO: nunca defenda preço. Aumente o valor percebido até o preço parecer pequeno.\n4. EVITE "MAS" — substitua por "E" ou "AO MESMO TEMPO". "Entendo, MAS" vira "Entendo. E ao mesmo tempo…".\n5. PERGUNTAS DE ABISMO: "O que vai acontecer se daqui 6 meses você ainda estiver na mesma situação?"',
 '["Caro comparado a quê?", "Faz sentido o que tô falando?", "Imagina daqui 6 meses ainda nessa situação…", "O que falta pra você decidir hoje?"]'::jsonb,
 'Cliente com objeção de preço, "vou pensar", ou indeciso entre opções.',
 'Cliente em estado emocional alto (luto recente, doença grave) — aí Voss primeiro.',
 ARRAY['objecao', 'preco', 'reframing', 'br'],
 '#F59E0B',
 'Zap',
 true),

('marcelo-ortega',
 'Marcelo Ortega',
 'Mestre brasileiro do fechamento consultivo',
 'Especialista em conduzir o lead até o "sim" com perguntas progressivas e fechamentos suaves (assumed close, alternative close).',
 'consultivo, conduzido, seguro — passa autoridade sem arrogância',
 'Usa muito "vamos", "a gente". Pergunta como se já tivesse fechado: "prefere começar essa semana ou na próxima?".',
 E'1. ASSUMED CLOSE: fale como se ele já comprou. "Quando ativarmos seu plano, você vai…".\n2. ALTERNATIVE CLOSE: dê 2 opções, ambas favoráveis. "Prefere começar essa semana ou semana que vem?".\n3. PERGUNTA DE COMPROMISSO PROGRESSIVA: pequenos sins até o sim final. "Faz sentido?", "Tá claro?", "Combinado?".\n4. RESUMA O VALOR antes de pedir o fechamento: "Então, recapitulando: cobertura X, preço Y, começa em Z…".\n5. QUEM FALA O PREÇO PERDE — espere ele perguntar ou justifique valor primeiro.',
 '["Faz sentido pra você?", "Combinado então?", "Vamos começar essa semana ou na próxima?", "Recapitulando: você tá levando…"]'::jsonb,
 'Lead já qualificado, com cotação na mão, falta empurrãozinho final.',
 'Lead em fase de descoberta — fechar muito cedo afasta.',
 ARRAY['fechamento', 'conducao', 'br'],
 '#10B981',
 'Target',
 true),

('thiago-concer',
 'Thiago Concer',
 'Maior treinador de vendas BR — energia, postura e ritmo',
 'Energia controlada e ritmo de conversa. Faz cliente se sentir importante. Postura de especialista que NÃO precisa do cliente.',
 'energético sem ser agressivo, próximo sem ser íntimo demais',
 'Usa frases curtas, ritmo rápido. "Vou ser direto contigo", "Olha só…", "Posso te falar uma coisa?".',
 E'1. POSTURA DE QUEM NÃO PRECISA: você AJUDA, não implora. Quem precisa dele, perde ele.\n2. RITMO: frases curtas, perguntas afiadas. Nunca textão.\n3. AUTORIDADE PELO CLIENTE: "Atendi 200 famílias esse ano com situação parecida com a sua".\n4. ESCASSEZ HONESTA: vagas reais, preços que sobem mês que vem REAIS. Nunca invente.\n5. CHAMA O CLIENTE PRO JOGO: "Tô aqui pra te ajudar de verdade. Você tá pronto pra resolver isso ou ainda não?".',
 '["Vou ser direto contigo…", "Olha só…", "Posso te falar uma coisa?", "Quem precisa dele, perde ele.", "Tô aqui pra te ajudar de verdade."]'::jsonb,
 'Lead morno, precisa de energia. Lead que tá testando o vendedor.',
 'Lead em luto ou estado emocional frágil — energia demais é invasivo.',
 ARRAY['energia', 'postura', 'ritmo', 'br'],
 '#EC4899',
 'Flame',
 true);

-- =====================================================================
-- 7. SEED — Sales Techniques (8 técnicas universais)
-- =====================================================================
INSERT INTO public.sales_techniques (slug, nome, categoria, descricao, como_aplicar, exemplos, gatilho_uso, fonte_autor, nivel_dificuldade, cor_hex, icone, is_default) VALUES
('mirroring',
 'Mirroring (Espelhamento)',
 'rapport',
 'Repetir as últimas 1 a 3 palavras do cliente em forma de pergunta. Faz ele continuar falando e revela o que ele REALMENTE quer dizer.',
 E'Quando o cliente disser algo importante mas vago, repita as últimas 1-3 palavras com entonação de pergunta. NÃO use ponto de interrogação literal — use "…" no fim. NUNCA use mais de uma vez seguida.',
 '[{"situacao": "Cliente está vago sobre orçamento", "cliente": "Tá meio apertado esse mês", "agente": "Meio apertado…?"}, {"situacao": "Cliente menciona experiência ruim", "cliente": "Já tive plano antes mas tive uma experiência ruim", "agente": "Experiência ruim…"}]'::jsonb,
 'Cliente disse algo vago, emocional ou contraditório.',
 'Chris Voss',
 2,
 '#3B82F6',
 'MessageCircle',
 true),

('labeling',
 'Labeling (Rotulagem Emocional)',
 'rapport',
 'Nomear a emoção que o cliente parece sentir. Cria empatia profunda em uma frase.',
 E'Use "Parece que…", "Soa como…", "Imagino que…". Nunca diga "Eu entendo" (soa falso). Nomeie a emoção, espere reação.',
 '[{"situacao": "Cliente parece frustrado", "cliente": "Já liguei pra 3 corretores e ninguém me retornou", "agente": "Parece que você já tá cansado de ficar caçando alguém pra te dar atenção."}]'::jsonb,
 'Cliente demonstra frustração, medo, urgência ou ceticismo.',
 'Chris Voss',
 3,
 '#3B82F6',
 'Heart',
 true),

('reframing-objecao',
 'Reframing de Objeção',
 'objecao',
 'Pegar a objeção e devolver com nova moldura, transformando obstáculo em pergunta.',
 E'Toda objeção vira pergunta de volta. "Tá caro" → "Caro comparado a quê?". "Vou pensar" → "O que falta pra você decidir?". NUNCA defenda — investigue.',
 '[{"situacao": "Objeção de preço", "cliente": "Achei caro", "agente": "Caro comparado a quê? Me ajuda a entender."}, {"situacao": "Procrastinação", "cliente": "Vou pensar e te falo", "agente": "Faz sentido. O que precisa ficar mais claro pra você decidir?"}]'::jsonb,
 'Cliente solta objeção genérica (caro, pensar, falar com esposa, etc).',
 'Werner Braun',
 3,
 '#F59E0B',
 'RefreshCw',
 true),

('contraste-problema-solucao',
 'Contraste Problema-Solução',
 'descoberta',
 'Pintar o problema (e suas consequências) ANTES de apresentar a solução. Aumenta valor percebido.',
 E'Antes de mostrar plano/preço, faça o cliente ENXERGAR o problema sem solução. Pergunta de abismo: "O que acontece daqui 6 meses se nada mudar?".',
 '[{"situacao": "Cliente sem urgência", "cliente": "Tô só pesquisando ainda", "agente": "Imagina daqui 3 meses precisando de uma cirurgia urgente e descobrindo que tem carência. Já parou pra pensar nisso?"}]'::jsonb,
 'Cliente sem urgência, comparando preço, "só pesquisando".',
 'Werner Braun',
 4,
 '#F59E0B',
 'AlertTriangle',
 true),

('assumed-close',
 'Assumed Close (Fechamento Presumido)',
 'fechamento',
 'Falar como se a venda já estivesse fechada. Reduz fricção da decisão.',
 E'Use verbos no futuro como se fosse certeza. "Quando você ativar…", "Assim que aprovarmos…", "Seu cartão você vai receber em…".',
 '[{"situacao": "Lead qualificado em cotação", "cliente": "Hmm, gostei do plano", "agente": "Ótimo. Quando seu plano ativar, você já consegue marcar consulta na rede X. Vamos pelo cartão de crédito ou boleto?"}]'::jsonb,
 'Lead qualificado, com cotação enviada, demonstrou interesse positivo.',
 'Marcelo Ortega',
 3,
 '#10B981',
 'CheckCircle2',
 true),

('alternative-close',
 'Alternative Close (Duas Opções)',
 'fechamento',
 'Oferecer duas opções, ambas favoráveis a fechar. Tira o "não" da mesa.',
 E'NUNCA pergunte "quer fechar?". Pergunte "prefere A ou B?", onde ambas levam ao sim. "Hoje ou amanhã?", "PIX ou cartão?".',
 '[{"situacao": "Pedido de fechamento", "cliente": "", "agente": "Prefere começar a vigência dia 1º ou dia 15?"}]'::jsonb,
 'Hora de pedir fechamento, lead já decidiu mas hesita em assumir.',
 'Marcelo Ortega',
 2,
 '#10B981',
 'GitBranch',
 true),

('pergunta-calibrada',
 'Pergunta Calibrada (Como/O quê)',
 'descoberta',
 'Trocar "por que" (acusatório) por "como" e "o quê" (cooperativo). Cliente abre mais.',
 E'NUNCA use "Por que…?" — soa interrogatório. Substitua por "Como…?" ou "O que…?". "Como você tá pensando em resolver?", "O que é mais importante pra você nesse plano?".',
 '[{"situacao": "Investigação de necessidade", "cliente": "Quero um plano bom mas barato", "agente": "Como você define plano bom hoje? Tipo, o que ele PRECISA ter?"}]'::jsonb,
 'Toda fase de descoberta. Sempre que precisar fazer cliente refletir.',
 'Chris Voss',
 2,
 '#3B82F6',
 'HelpCircle',
 true),

('escassez-honesta',
 'Escassez Honesta',
 'urgencia',
 'Usar escassez REAL (preço sobe, vagas limitadas, prazo de operadora) — nunca inventar.',
 E'Só mencione escassez se for VERDADE verificável: "Essa tabela vence dia X", "A operadora só aceita ativação até dia Y do mês". Mentir destrói confiança.',
 '[{"situacao": "Lead procrastinando", "cliente": "Vou ver semana que vem", "agente": "Tudo bem. Só te aviso: a operadora só aceita ativação até dia 25 do mês com a vigência do dia 1º. Depois disso, só pra mês seguinte."}]'::jsonb,
 'Lead procrastinando com prazo real envolvido.',
 'Thiago Concer',
 3,
 '#EC4899',
 'Clock',
 true);

-- =====================================================================
-- 8. SEED — Conecta Camila SDR aos cérebros e técnicas dela
-- =====================================================================
INSERT INTO public.agent_vendor_profiles (agent_slug, vendor_profile_id, peso, notas)
SELECT 'sdr-qualificador', id,
  CASE slug
    WHEN 'chris-voss' THEN 9      -- principal: ela é uma SDR empática
    WHEN 'werner-braun' THEN 7    -- usa em objeções
    WHEN 'thiago-concer' THEN 6   -- usa pra ritmo/postura
    WHEN 'marcelo-ortega' THEN 4  -- pouco — fechamento é dos outros agents
  END,
  CASE slug
    WHEN 'chris-voss' THEN 'Cérebro principal da Camila — primeiro contato'
    WHEN 'werner-braun' THEN 'Quando lead solta objeção'
    WHEN 'thiago-concer' THEN 'Pra manter ritmo e postura'
    WHEN 'marcelo-ortega' THEN 'Só pra fechamentos pequenos (agendar call)'
  END
FROM public.vendor_profiles
WHERE slug IN ('chris-voss', 'werner-braun', 'thiago-concer', 'marcelo-ortega');

INSERT INTO public.agent_techniques (agent_slug, technique_id, prioridade, notas)
SELECT 'sdr-qualificador', id,
  CASE slug
    WHEN 'mirroring' THEN 1
    WHEN 'labeling' THEN 2
    WHEN 'pergunta-calibrada' THEN 3
    WHEN 'reframing-objecao' THEN 4
    WHEN 'contraste-problema-solucao' THEN 5
    WHEN 'escassez-honesta' THEN 6
    WHEN 'assumed-close' THEN 7
    WHEN 'alternative-close' THEN 8
  END,
  'Configurada por padrão pra Camila SDR'
FROM public.sales_techniques;