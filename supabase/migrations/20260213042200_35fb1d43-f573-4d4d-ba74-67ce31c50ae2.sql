
-- Add quote-related columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS quote_min_value numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quote_operadora text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS quote_plan_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_quote_sent_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approved_value numeric DEFAULT NULL;
