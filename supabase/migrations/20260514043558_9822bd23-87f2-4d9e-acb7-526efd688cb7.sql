-- Drop FK temporariamente para permitir renomeação do slug pai
ALTER TABLE public.agent_persona_config DROP CONSTRAINT agent_persona_config_agent_slug_fkey;

-- 1) agents_config: renomeia slug e atualiza nome
UPDATE public.agents_config
   SET slug = 'junior-sdr', nome = 'Junior-SDR (Pré-Qualificador)'
 WHERE slug = 'sdr-qualificador';

-- 2) Tabelas com agent_slug textual
UPDATE public.agent_audios          SET agent_slug = 'junior-sdr' WHERE agent_slug = 'sdr-qualificador';
UPDATE public.agent_examples        SET agent_slug = 'junior-sdr' WHERE agent_slug = 'sdr-qualificador';
UPDATE public.agent_persona_config  SET agent_slug = 'junior-sdr' WHERE agent_slug = 'sdr-qualificador';
UPDATE public.agent_conversations   SET agent_slug = 'junior-sdr' WHERE agent_slug = 'sdr-qualificador';
UPDATE public.agent_techniques      SET agent_slug = 'junior-sdr' WHERE agent_slug = 'sdr-qualificador';
UPDATE public.agent_vendor_profiles SET agent_slug = 'junior-sdr' WHERE agent_slug = 'sdr-qualificador';
UPDATE public.agent_budgets         SET agent_slug = 'junior-sdr' WHERE agent_slug = 'sdr-qualificador';
UPDATE public.agent_budget_alerts   SET agent_slug = 'junior-sdr' WHERE agent_slug = 'sdr-qualificador';
UPDATE public.agents_config_history SET agent_slug = 'junior-sdr' WHERE agent_slug = 'sdr-qualificador';
UPDATE public.campaign_triggers     SET agent_slug = 'junior-sdr' WHERE agent_slug = 'sdr-qualificador';
UPDATE public.mente_usage_log       SET agent_slug = 'junior-sdr' WHERE agent_slug = 'sdr-qualificador';
UPDATE public.scheduled_messages    SET agent_slug = 'junior-sdr' WHERE agent_slug = 'sdr-qualificador';

-- 3) Rewarming
UPDATE public.rewarming_campaigns SET agente_slug = 'junior-sdr'
 WHERE agente_slug IN ('camila-sdr','sdr-qualificador');

-- Recria FK com ON UPDATE CASCADE
ALTER TABLE public.agent_persona_config
  ADD CONSTRAINT agent_persona_config_agent_slug_fkey
  FOREIGN KEY (agent_slug) REFERENCES public.agents_config(slug)
  ON UPDATE CASCADE ON DELETE CASCADE;