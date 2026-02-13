
-- Closing sequences table
CREATE TABLE public.closing_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  current_step INTEGER NOT NULL DEFAULT 1,
  paused_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(lead_id)
);

ALTER TABLE public.closing_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own closing sequences" ON public.closing_sequences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own closing sequences" ON public.closing_sequences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own closing sequences" ON public.closing_sequences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own closing sequences" ON public.closing_sequences FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_closing_sequences_updated_at BEFORE UPDATE ON public.closing_sequences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Closing steps table
CREATE TABLE public.closing_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID NOT NULL REFERENCES public.closing_sequences(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  ai_analysis TEXT,
  generated_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.closing_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own closing steps" ON public.closing_steps FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own closing steps" ON public.closing_steps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own closing steps" ON public.closing_steps FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own closing steps" ON public.closing_steps FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_closing_steps_updated_at BEFORE UPDATE ON public.closing_steps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.closing_sequences;
ALTER PUBLICATION supabase_realtime ADD TABLE public.closing_steps;
