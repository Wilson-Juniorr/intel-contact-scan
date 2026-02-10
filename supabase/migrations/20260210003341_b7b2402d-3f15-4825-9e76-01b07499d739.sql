
-- Tabela de membros (titulares e dependentes) de um lead
CREATE TABLE public.lead_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'titular' CHECK (role IN ('titular', 'dependente')),
  name TEXT NOT NULL,
  cpf TEXT,
  birth_date DATE,
  email TEXT,
  phone TEXT,
  vinculo TEXT, -- Cônjuge, Filho(a), Pai/Mãe, etc. (só dependentes)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.lead_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lead members"
  ON public.lead_members FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own lead members"
  ON public.lead_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lead members"
  ON public.lead_members FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lead members"
  ON public.lead_members FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_lead_members_updated_at
  BEFORE UPDATE ON public.lead_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar member_id em lead_documents (nullable — docs gerais ficam sem member)
ALTER TABLE public.lead_documents
  ADD COLUMN member_id UUID REFERENCES public.lead_members(id) ON DELETE SET NULL;
