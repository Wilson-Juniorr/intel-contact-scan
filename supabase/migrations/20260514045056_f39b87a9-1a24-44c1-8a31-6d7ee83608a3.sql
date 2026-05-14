-- Tabela de tentativas do follow-up pós-cotação (Junior)
CREATE TABLE IF NOT EXISTS public.junior_followup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  user_id uuid NOT NULL,
  step_index integer NOT NULL,                      -- 0,1,2,3 (corresponde ao índice da cadência)
  cadence_offset_hours integer NOT NULL,            -- offset em horas a partir de last_quote_sent_at
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',           -- pending | sent | skipped | failed | cancelled
  skip_reason text,                                 -- motivo do skip (in_manual, opted_out, recent_inbound, off_window, opt_out_keyword, gate_blocked, ...)
  message_content text,
  approach_tag text,                                -- variação usada (ex: "checagem_leve", "valor_concreto", "deadline_suave", "encerrar")
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, step_index)
);

CREATE INDEX IF NOT EXISTS idx_jfa_pending
  ON public.junior_followup_attempts (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_jfa_lead
  ON public.junior_followup_attempts (lead_id, step_index);

ALTER TABLE public.junior_followup_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own jfa"
  ON public.junior_followup_attempts
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service manage jfa"
  ON public.junior_followup_attempts
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);