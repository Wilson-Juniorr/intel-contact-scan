
-- Add recommended_due_at to closing_steps for cadence timing
ALTER TABLE public.closing_steps ADD COLUMN IF NOT EXISTS recommended_due_at timestamp with time zone;

-- Add index for efficient querying of pending steps by due date
CREATE INDEX IF NOT EXISTS idx_closing_steps_recommended_due ON public.closing_steps (recommended_due_at) WHERE status IN ('pending', 'ready');
