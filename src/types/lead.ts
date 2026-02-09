export type LeadType = "PF" | "ADESAO" | "PME";

export type PlanType = "Individual" | "Familiar" | "Adesão" | "PME";

export type FunnelStage =
  | "novo"
  | "tentativa_contato"
  | "contato_realizado"
  | "cotacao_enviada"
  | "cotacao_aprovada"
  | "documentacao_completa"
  | "em_emissao"
  | "aguardando_implantacao"
  | "implantado"
  | "retrabalho"
  | "declinado"
  | "cancelado";

export const FUNNEL_STAGES: { key: FunnelStage; label: string; color: string; weight: number }[] = [
  { key: "novo", label: "Novo Negócio", color: "hsl(199, 89%, 48%)", weight: 10 },
  { key: "tentativa_contato", label: "Tentativa de Contato", color: "hsl(199, 75%, 48%)", weight: 10 },
  { key: "contato_realizado", label: "Contato Realizado", color: "hsl(199, 65%, 45%)", weight: 10 },
  { key: "cotacao_enviada", label: "Cotação Enviada", color: "hsl(199, 55%, 42%)", weight: 20 },
  { key: "cotacao_aprovada", label: "Cotação Aprovada", color: "hsl(170, 60%, 40%)", weight: 50 },
  { key: "documentacao_completa", label: "Documentação Completa", color: "hsl(170, 70%, 38%)", weight: 70 },
  { key: "em_emissao", label: "Em Emissão", color: "hsl(150, 60%, 38%)", weight: 100 },
  { key: "aguardando_implantacao", label: "Aguardando Implantação", color: "hsl(150, 70%, 35%)", weight: 100 },
  { key: "implantado", label: "Implantado", color: "hsl(140, 70%, 40%)", weight: 100 },
  { key: "retrabalho", label: "Retrabalho", color: "hsl(35, 85%, 50%)", weight: 0 },
  { key: "declinado", label: "Declinado", color: "hsl(0, 60%, 55%)", weight: 0 },
  { key: "cancelado", label: "Cancelado", color: "hsl(0, 72%, 51%)", weight: 0 },
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
