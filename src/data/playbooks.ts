import type { FunnelStage } from "@/types/lead";

export interface PlaybookTask {
  title: string;
  description?: string;
}

export interface Playbook {
  stage: FunnelStage;
  objective: string;
  tasks: PlaybookTask[];
  recommendedTemplates: string[]; // template IDs from whatsappTemplates
  priorityTrigger: string;
  daysUrgent: number;
  daysCritical: number;
}

export const PLAYBOOKS: Playbook[] = [
  {
    stage: "novo",
    objective: "Fazer primeiro contato e qualificar o lead",
    tasks: [
      { title: "Enviar mensagem de apresentação" },
      { title: "Identificar necessidade (PF/PME/Adesão)" },
      { title: "Perguntar quantidade de vidas" },
    ],
    recommendedTemplates: ["novo_primeiro", "novo_apresentacao"],
    priorityTrigger: "Lead novo sem contato",
    daysUrgent: 1,
    daysCritical: 2,
  },
  {
    stage: "tentativa_contato",
    objective: "Conseguir resposta do lead",
    tasks: [
      { title: "Tentar contato via WhatsApp" },
      { title: "Tentar ligação telefônica" },
      { title: "Enviar última tentativa se sem resposta" },
    ],
    recommendedTemplates: ["tentativa_followup", "tentativa_ultimo"],
    priorityTrigger: "Sem resposta após tentativas",
    daysUrgent: 2,
    daysCritical: 4,
  },
  {
    stage: "contato_realizado",
    objective: "Levantar necessidades e preparar cotação",
    tasks: [
      { title: "Confirmar dados do lead (tipo, vidas, região)" },
      { title: "Identificar operadora preferida e rede desejada" },
      { title: "Levantar orçamento disponível" },
      { title: "Preparar cotação personalizada" },
    ],
    recommendedTemplates: ["geral_retorno"],
    priorityTrigger: "Contato feito mas cotação não enviada",
    daysUrgent: 3,
    daysCritical: 5,
  },
  {
    stage: "cotacao_enviada",
    objective: "Obter aprovação da cotação",
    tasks: [
      { title: "Confirmar recebimento da cotação" },
      { title: "Tirar dúvidas sobre coberturas e carências" },
      { title: "Oferecer ajustes se necessário" },
      { title: "Enviar comparativo se solicitado" },
    ],
    recommendedTemplates: ["cotacao_lembrete", "cotacao_duvidas", "cotacao_prazo"],
    priorityTrigger: "Cotação enviada sem retorno",
    daysUrgent: 3,
    daysCritical: 5,
  },
  {
    stage: "cotacao_aprovada",
    objective: "Coletar documentação completa",
    tasks: [
      { title: "Enviar lista de documentos necessários" },
      { title: "Coletar documentos do titular" },
      { title: "Coletar documentos dos dependentes" },
      { title: "Conferir documentação" },
    ],
    recommendedTemplates: ["aprovada_docs"],
    priorityTrigger: "Documentação pendente",
    daysUrgent: 3,
    daysCritical: 7,
  },
  {
    stage: "documentacao_completa",
    objective: "Enviar proposta para emissão",
    tasks: [
      { title: "Revisar documentação final" },
      { title: "Enviar para análise da operadora" },
      { title: "Acompanhar status com a operadora" },
    ],
    recommendedTemplates: ["docs_confirmacao", "docs_pendente"],
    priorityTrigger: "Documentação completa sem encaminhamento",
    daysUrgent: 2,
    daysCritical: 4,
  },
  {
    stage: "em_emissao",
    objective: "Acompanhar emissão e informar lead",
    tasks: [
      { title: "Verificar status da emissão com a operadora" },
      { title: "Informar número da proposta ao lead" },
      { title: "Confirmar dados da proposta" },
    ],
    recommendedTemplates: ["emissao_status"],
    priorityTrigger: "Emissão em andamento sem atualização",
    daysUrgent: 3,
    daysCritical: 7,
  },
  {
    stage: "aguardando_implantacao",
    objective: "Acompanhar implantação e ativar plano",
    tasks: [
      { title: "Confirmar previsão de ativação" },
      { title: "Informar lead sobre prazo" },
      { title: "Verificar ativação do plano" },
      { title: "Enviar boas-vindas pós-ativação" },
    ],
    recommendedTemplates: ["implantacao_prazo"],
    priorityTrigger: "Aguardando ativação sem atualização",
    daysUrgent: 5,
    daysCritical: 10,
  },
  {
    stage: "retrabalho",
    objective: "Retomar contato e entender nova situação",
    tasks: [
      { title: "Entender motivo do retrabalho" },
      { title: "Apresentar novas condições se houver" },
      { title: "Reagendar reunião/ligação" },
    ],
    recommendedTemplates: ["retrabalho_retomada"],
    priorityTrigger: "Lead em retrabalho sem ação",
    daysUrgent: 3,
    daysCritical: 7,
  },
];

export function getPlaybookForStage(stage: FunnelStage): Playbook | undefined {
  return PLAYBOOKS.find((p) => p.stage === stage);
}
