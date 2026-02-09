export type LeadType = "PF" | "PJ" | "PME";

export type PlanType = "Individual" | "Familiar" | "Empresarial" | "PME";

export type FunnelStage =
  | "novo"
  | "primeiro_contato"
  | "cotacao_enviada"
  | "em_negociacao"
  | "proposta_aceita"
  | "implantacao"
  | "convertido"
  | "perdido";

export const FUNNEL_STAGES: { key: FunnelStage; label: string; color: string }[] = [
  { key: "novo", label: "Novo Lead", color: "hsl(199, 89%, 48%)" },
  { key: "primeiro_contato", label: "Primeiro Contato", color: "hsl(210, 70%, 55%)" },
  { key: "cotacao_enviada", label: "Cotação Enviada", color: "hsl(270, 60%, 55%)" },
  { key: "em_negociacao", label: "Em Negociação", color: "hsl(35, 92%, 55%)" },
  { key: "proposta_aceita", label: "Proposta Aceita", color: "hsl(160, 60%, 45%)" },
  { key: "implantacao", label: "Implantação", color: "hsl(160, 80%, 35%)" },
  { key: "convertido", label: "Convertido", color: "hsl(140, 70%, 40%)" },
  { key: "perdido", label: "Perdido", color: "hsl(0, 72%, 51%)" },
];

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  type: LeadType;
  plan_type?: PlanType;
  operator?: string;
  lives?: number;
  notes?: string;
  stage: FunnelStage;
  lost_reason?: string;
  created_at: string;
  updated_at: string;
  last_contact_at?: string;
}

export interface Interaction {
  id: string;
  lead_id: string;
  type: "call" | "whatsapp" | "meeting" | "email" | "note";
  description: string;
  created_at: string;
}

export interface Reminder {
  id: string;
  lead_id: string;
  date: string;
  description: string;
  completed: boolean;
}
