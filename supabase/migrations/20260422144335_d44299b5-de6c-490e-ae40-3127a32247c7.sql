-- Budget config per agent (or global with agent_slug = '*')
CREATE TABLE public.agent_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_slug TEXT NOT NULL UNIQUE,
  daily_limit_usd NUMERIC NOT NULL DEFAULT 5,
  monthly_limit_usd NUMERIC NOT NULL DEFAULT 100,
  warn_at_pct INTEGER NOT NULL DEFAULT 80,
  pause_on_exceed BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read budgets"
  ON public.agent_budgets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/supervisor manage budgets"
  ON public.agent_budgets FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

CREATE TRIGGER update_agent_budgets_updated_at
  BEFORE UPDATE ON public.agent_budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Alert log
CREATE TABLE public.agent_budget_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_slug TEXT NOT NULL,
  periodo TEXT NOT NULL,
  limite_usd NUMERIC NOT NULL,
  gasto_usd NUMERIC NOT NULL,
  pct_consumido NUMERIC NOT NULL,
  tipo TEXT NOT NULL,
  acao_tomada TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_budget_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read budget alerts"
  ON public.agent_budget_alerts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service insert budget alerts"
  ON public.agent_budget_alerts FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_budget_alerts_agent_date ON public.agent_budget_alerts(agent_slug, created_at DESC);