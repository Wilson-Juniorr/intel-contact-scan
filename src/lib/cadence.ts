import type { FunnelStage } from "@/types/lead";
import { cleanPhone, buildWhatsAppUrl as buildWaUrl } from "@/lib/phone";

export const CADENCE_RULES: Record<string, number> = {
  novo: 0,
  tentativa_contato: 1,
  contato_realizado: 2,
  cotacao_enviada: 1,
  cotacao_aprovada: 1,
  documentacao_completa: 2,
  em_emissao: 2,
  aguardando_implantacao: 3,
  implantado: 30,
  retrabalho: 1,
};

export const WHATSAPP_MESSAGES: Record<string, string> = {
  novo: "Olá {nome}! Tudo bem? Vi seu interesse em planos de saúde. Posso te ajudar a encontrar a melhor opção para você. Quando podemos conversar?",
  tentativa_contato:
    "Olá {nome}! Tentei seu contato anteriormente. Você tem um momento para conversarmos sobre planos de saúde?",
  contato_realizado:
    "Olá {nome}! Dando continuidade à nossa conversa, já consegui levantar algumas opções que se encaixam no seu perfil. Posso te enviar?",
  cotacao_enviada:
    "Olá {nome}! Enviei a cotação há alguns dias. Conseguiu analisar? Fico à disposição para tirar qualquer dúvida!",
  cotacao_aprovada:
    "Olá {nome}! Ótima notícia que gostou da cotação! Podemos avançar com a proposta? Tenho tudo pronto para agilizar a implantação.",
  documentacao_completa:
    "Olá {nome}! A documentação está completa. Vamos dar andamento na emissão do plano?",
  em_emissao: "Olá {nome}! Seu plano está em processo de emissão. Qualquer novidade te aviso!",
  aguardando_implantacao:
    "Olá {nome}! Estamos aguardando a implantação do seu plano. Precisa de algum suporte?",
  implantado:
    "Olá {nome}! Passando para saber como está sendo a experiência com o plano. Precisa de algum suporte?",
  retrabalho:
    "Olá {nome}! Gostaria de retomar nossa conversa sobre planos de saúde. Posso te apresentar novas opções?",
};

export type CadenceStatus = "atrasado" | "hoje" | "agendado";

export interface LeadWithCadence {
  lead: any;
  diasSemContato: number;
  intervaloIdeal: number;
  status: CadenceStatus;
}

const EXCLUDED_STAGES: FunnelStage[] = ["declinado", "cancelado"];

export function classifyLeads(leads: any[]): {
  atrasados: LeadWithCadence[];
  hoje: LeadWithCadence[];
  agendados: LeadWithCadence[];
} {
  const now = Date.now();
  const result: LeadWithCadence[] = [];

  for (const lead of leads) {
    if (EXCLUDED_STAGES.includes(lead.stage)) continue;

    const lastDate = lead.last_contact_at || lead.created_at;
    const diasSemContato = Math.floor((now - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24));
    const intervaloIdeal = CADENCE_RULES[lead.stage] ?? 2;

    let status: CadenceStatus;
    if (diasSemContato > intervaloIdeal + 1) {
      status = "atrasado";
    } else if (diasSemContato >= intervaloIdeal) {
      status = "hoje";
    } else {
      status = "agendado";
    }

    result.push({ lead, diasSemContato, intervaloIdeal, status });
  }

  // Priority stages for sorting "hoje"
  const PRIORITY_STAGES = ["cotacao_enviada", "cotacao_aprovada"];

  const atrasados = result
    .filter((r) => r.status === "atrasado")
    .sort((a, b) => b.diasSemContato - a.diasSemContato);

  const hoje = result
    .filter((r) => r.status === "hoje")
    .sort((a, b) => {
      const aPriority = PRIORITY_STAGES.includes(a.lead.stage) ? 0 : 1;
      const bPriority = PRIORITY_STAGES.includes(b.lead.stage) ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return b.diasSemContato - a.diasSemContato;
    });

  const agendados = result
    .filter((r) => r.status === "agendado")
    .sort((a, b) => b.diasSemContato - a.diasSemContato);

  return { atrasados, hoje, agendados };
}

export function buildWhatsAppUrl(phone: string, stage: string, name: string): string {
  const template = WHATSAPP_MESSAGES[stage] || WHATSAPP_MESSAGES.novo;
  const firstName = name.split(" ")[0];
  const message = template.replace("{nome}", firstName);
  return buildWaUrl(phone, message);
}
