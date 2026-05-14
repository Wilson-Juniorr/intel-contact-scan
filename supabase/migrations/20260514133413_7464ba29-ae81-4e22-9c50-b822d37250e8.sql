ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS qual_score text,
  ADD COLUMN IF NOT EXISTS qual_score_reason text,
  ADD COLUMN IF NOT EXISTS qual_score_breakdown jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS qual_score_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_qual_score ON public.leads(qual_score) WHERE qual_score IS NOT NULL;
