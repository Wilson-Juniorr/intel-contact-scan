-- Tabela de áudios do agente
CREATE TABLE public.agent_audios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug TEXT NOT NULL,
  trigger TEXT NOT NULL,
  descricao TEXT NOT NULL,
  audio_url TEXT NOT NULL DEFAULT '',
  duracao_segundos INTEGER,
  ativo BOOLEAN NOT NULL DEFAULT false,
  ordem INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_slug, trigger)
);

ALTER TABLE public.agent_audios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read audios"
  ON public.agent_audios FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage audios"
  ON public.agent_audios FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

CREATE TRIGGER update_agent_audios_updated_at
  BEFORE UPDATE ON public.agent_audios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed dos 5 triggers
INSERT INTO public.agent_audios (agent_slug, trigger, descricao, ordem) VALUES
  ('sdr-qualificador', 'apresentacao', 'Junior se apresenta com a voz após lead engajar (turn 2+, msg com 5+ palavras)', 1),
  ('sdr-qualificador', 'entendimento', 'Junior confirma que entendeu a situação (4+ campos coletados)', 2),
  ('sdr-qualificador', 'qualificacao_completa', 'Junior avisa que vai montar as opções (qualificou=true)', 3),
  ('sdr-qualificador', 'follow_up_dia2', 'Reativação leve no dia 2 (24-48h sem resposta)', 4),
  ('sdr-qualificador', 'follow_up_dia5', 'Reativação com urgência no dia 5 (4-5 dias sem resposta)', 5);

-- Bucket público para os áudios
INSERT INTO storage.buckets (id, name, public) VALUES ('agent-audios', 'agent-audios', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read agent audios"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'agent-audios');

CREATE POLICY "Admin upload agent audios"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agent-audios' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));

CREATE POLICY "Admin update agent audios"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'agent-audios' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));

CREATE POLICY "Admin delete agent audios"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agent-audios' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role)));