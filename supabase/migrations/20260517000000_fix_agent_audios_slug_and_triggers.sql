-- Fix: agent_audios registrados com slug antigo 'sdr-qualificador'
-- O código busca com 'junior-sdr'. Corrige slug e alinha triggers.

-- 1. Atualiza slug de 'sdr-qualificador' para 'junior-sdr'
UPDATE public.agent_audios
SET agent_slug = 'junior-sdr'
WHERE agent_slug = 'sdr-qualificador';

-- 2. Alinha nomes dos triggers de follow-up com o código
UPDATE public.agent_audios
SET trigger = 'follow_up_24h'
WHERE agent_slug = 'junior-sdr' AND trigger = 'follow_up_dia2';

UPDATE public.agent_audios
SET trigger = 'follow_up_72h'
WHERE agent_slug = 'junior-sdr' AND trigger = 'follow_up_dia5';

-- 3. Insere triggers que faltam (se não existirem)
INSERT INTO public.agent_audios (agent_slug, trigger, descricao, ordem)
SELECT 'junior-sdr', 'follow_up_2h', 'Retomada leve 2h sem resposta (texto + áudio)', 4
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_audios WHERE agent_slug = 'junior-sdr' AND trigger = 'follow_up_2h'
);
