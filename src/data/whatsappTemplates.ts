import type { FunnelStage } from "@/types/lead";

export interface MessageTemplate {
  id: string;
  label: string;
  stage: FunnelStage | "geral";
  text: string;
}

/**
 * Templates de mensagem por estágio do funil.
 * Variáveis suportadas: {nome}, {operadora}, {vidas}, {prazo}
 */
export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  // Geral
  {
    id: "geral_ola",
    label: "Olá, tudo bem?",
    stage: "geral",
    text: "Olá {nome}, tudo bem? Aqui é da consultoria de planos de saúde. Como posso te ajudar hoje?",
  },
  {
    id: "geral_retorno",
    label: "Retorno de contato",
    stage: "geral",
    text: "Oi {nome}, estou retornando o contato sobre planos de saúde. Ainda tem interesse? Fico à disposição!",
  },

  // Novo
  {
    id: "novo_primeiro",
    label: "Primeiro contato",
    stage: "novo",
    text: "Olá {nome}! Vi que você tem interesse em planos de saúde. Posso te apresentar as melhores opções para o seu perfil? 😊",
  },
  {
    id: "novo_apresentacao",
    label: "Apresentação rápida",
    stage: "novo",
    text: "Oi {nome}, tudo bem? Sou consultor(a) de planos de saúde e gostaria de entender melhor a sua necessidade para encontrar o plano ideal. Podemos conversar?",
  },

  // Tentativa de contato
  {
    id: "tentativa_followup",
    label: "Follow-up de contato",
    stage: "tentativa_contato",
    text: "Oi {nome}, tentei falar com você mas não consegui. Podemos agendar um horário para conversarmos sobre as opções de planos de saúde?",
  },
  {
    id: "tentativa_ultimo",
    label: "Última tentativa",
    stage: "tentativa_contato",
    text: "Olá {nome}, fiz algumas tentativas de contato. Caso ainda tenha interesse em planos de saúde, estou à disposição! É só me chamar aqui. 😊",
  },

  // Cotação enviada
  {
    id: "cotacao_lembrete",
    label: "Lembrete de cotação",
    stage: "cotacao_enviada",
    text: "Oi {nome}! Enviei a cotação do plano {operadora}. Conseguiu dar uma olhada? Se quiser, posso ajustar valores ou comparar com outras operadoras.",
  },
  {
    id: "cotacao_duvidas",
    label: "Tirar dúvidas",
    stage: "cotacao_enviada",
    text: "{nome}, ficou com alguma dúvida sobre a cotação que enviei? Posso explicar as coberturas, carências e condições. Estou por aqui!",
  },
  {
    id: "cotacao_prazo",
    label: "Prazo especial",
    stage: "cotacao_enviada",
    text: "Oi {nome}, a condição especial da {operadora} tem prazo até {prazo}. Quer que eu reserve essa condição para você?",
  },

  // Cotação aprovada
  {
    id: "aprovada_docs",
    label: "Solicitar documentos",
    stage: "cotacao_aprovada",
    text: "Ótimo {nome}! Para prosseguir com o plano {operadora} ({vidas} vidas), preciso de alguns documentos. Posso enviar a lista?",
  },

  // Documentação completa
  {
    id: "docs_confirmacao",
    label: "Confirmação de docs",
    stage: "documentacao_completa",
    text: "Oi {nome}, recebi toda a documentação. Vou encaminhar para a {operadora} para análise. Te atualizo assim que tiver retorno!",
  },
  {
    id: "docs_pendente",
    label: "Documento pendente",
    stage: "documentacao_completa",
    text: "{nome}, para finalizar o processo com a {operadora} ainda falta um documento. Consegue me enviar? Assim consigo dar entrada rapidinho!",
  },

  // Em emissão
  {
    id: "emissao_status",
    label: "Status da emissão",
    stage: "em_emissao",
    text: "Oi {nome}, seu plano {operadora} está em processo de emissão. Assim que tiver o número da proposta te aviso! 🎉",
  },

  // Aguardando implantação
  {
    id: "implantacao_prazo",
    label: "Prazo de implantação",
    stage: "aguardando_implantacao",
    text: "{nome}, seu plano {operadora} foi aprovado! A previsão de ativação é até {prazo}. Qualquer novidade te aviso aqui.",
  },

  // Retrabalho
  {
    id: "retrabalho_retomada",
    label: "Retomada de contato",
    stage: "retrabalho",
    text: "Olá {nome}, faz um tempo que conversamos sobre planos de saúde. Surgiu alguma novidade? Tenho novas condições que podem te interessar!",
  },
];

export function getTemplatesForStage(stage?: string): MessageTemplate[] {
  if (!stage) return MESSAGE_TEMPLATES;
  return MESSAGE_TEMPLATES.filter((t) => t.stage === stage || t.stage === "geral");
}

export function fillTemplateVariables(
  text: string,
  variables: { nome?: string; operadora?: string; vidas?: number; prazo?: string }
): string {
  let result = text;
  result = result.replace(/{nome}/g, variables.nome || "Cliente");
  result = result.replace(/{operadora}/g, variables.operadora || "a operadora");
  result = result.replace(/{vidas}/g, String(variables.vidas || ""));
  result = result.replace(/{prazo}/g, variables.prazo || "[definir prazo]");
  return result;
}
