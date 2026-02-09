ALTER TABLE public.leads DROP CONSTRAINT leads_stage_check;

ALTER TABLE public.leads ADD CONSTRAINT leads_stage_check CHECK (stage = ANY (ARRAY[
  'novo'::text,
  'tentativa_contato'::text,
  'contato_realizado'::text,
  'cotacao_enviada'::text,
  'cotacao_aprovada'::text,
  'documentacao_completa'::text,
  'em_emissao'::text,
  'aguardando_implantacao'::text,
  'implantado'::text,
  'retrabalho'::text,
  'declinado'::text,
  'cancelado'::text
]));