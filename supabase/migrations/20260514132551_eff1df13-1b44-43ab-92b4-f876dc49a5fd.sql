-- Padroniza camila-sdr -> junior-sdr em todas as tabelas operacionais.
UPDATE public.lead_distribution_rules
   SET agente_alvo = 'junior-sdr'
 WHERE agente_alvo = 'camila-sdr';

UPDATE public.lead_distribution_rules
   SET agentes_pool = array_replace(agentes_pool, 'camila-sdr', 'junior-sdr')
 WHERE 'camila-sdr' = ANY(agentes_pool);

UPDATE public.rewarming_campaigns
   SET agente_slug = 'junior-sdr'
 WHERE agente_slug = 'camila-sdr';

UPDATE public.agents_config       SET slug = 'junior-sdr' WHERE slug = 'camila-sdr';
UPDATE public.agent_audios        SET agent_slug = 'junior-sdr' WHERE agent_slug = 'camila-sdr';
UPDATE public.agent_examples      SET agent_slug = 'junior-sdr' WHERE agent_slug = 'camila-sdr';
UPDATE public.agent_persona_config SET agent_slug = 'junior-sdr' WHERE agent_slug = 'camila-sdr';
UPDATE public.agent_conversations  SET agent_slug = 'junior-sdr' WHERE agent_slug = 'camila-sdr';
UPDATE public.agent_techniques     SET agent_slug = 'junior-sdr' WHERE agent_slug = 'camila-sdr';
UPDATE public.agent_vendor_profiles SET agent_slug = 'junior-sdr' WHERE agent_slug = 'camila-sdr';
UPDATE public.agent_budgets        SET agent_slug = 'junior-sdr' WHERE agent_slug = 'camila-sdr';
UPDATE public.agent_budget_alerts  SET agent_slug = 'junior-sdr' WHERE agent_slug = 'camila-sdr';
UPDATE public.agents_config_history SET agent_slug = 'junior-sdr' WHERE agent_slug = 'camila-sdr';
UPDATE public.campaign_triggers    SET agent_slug = 'junior-sdr' WHERE agent_slug = 'camila-sdr';
UPDATE public.mente_usage_log      SET agent_slug = 'junior-sdr' WHERE agent_slug = 'camila-sdr';
UPDATE public.scheduled_messages   SET agent_slug = 'junior-sdr' WHERE agent_slug = 'camila-sdr';

-- Default da coluna em campaign_triggers passa para junior-sdr.
ALTER TABLE public.campaign_triggers
  ALTER COLUMN agent_slug SET DEFAULT 'junior-sdr';