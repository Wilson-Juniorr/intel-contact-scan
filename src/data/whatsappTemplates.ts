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
    text: "Oi {nome}, tudo bem? Aqui é o Junior, consultor de planos de saúde. Me conta no que posso te ajudar",
  },
  {
    id: "geral_retorno",
    label: "Retorno de contato",
    stage: "geral",
    text: "Oi {nome}, aqui é o Junior. A gente tava conversando sobre plano de saúde. Ainda faz sentido pra você?",
  },

  // Novo
  {
    id: "novo_primeiro",
    label: "Primeiro contato",
    stage: "novo",
    text: "Oi {nome}! Vi que você tem interesse em plano de saúde. Me conta: é pra você ou pra mais pessoas?",
  },
  {
    id: "novo_apresentacao",
    label: "Apresentação rápida",
    stage: "novo",
    text: "Oi {nome}, tudo bem? Sou o Junior, consultor de planos de saúde. Trabalho com as principais operadoras. Me conta o que você tá buscando",
  },

  // Tentativa de contato
  {
    id: "tentativa_followup",
    label: "Follow-up de contato",
    stage: "tentativa_contato",
    text: "Oi {nome}, tentei te chamar mas sei que o dia a dia é corrido. Quando puder me responder a gente continua sobre o plano",
  },
  {
    id: "tentativa_ultimo",
    label: "Última tentativa",
    stage: "tentativa_contato",
    text: "{nome}, vou encerrar seu atendimento por aqui pra não ficar te incomodando. Se no futuro precisar de plano de saúde, pode me chamar que te atendo na hora. Fica bem!",
  },

  // Follow-up cadência
  {
    id: "followup_4h",
    label: "Follow-up 4h (curiosidade)",
    stage: "tentativa_contato",
    text: "Oi {nome}! Só pra não perder o fio da conversa — me falta só uma info pra montar suas opções. Quando puder me responder a gente continua rapidinho",
  },
  {
    id: "followup_dia2",
    label: "Follow-up dia 2 (valor)",
    stage: "tentativa_contato",
    text: "Oi {nome}, tudo bem? Separei umas opções que acho que vão te surpreender no custo-benefício. Quer que eu te mande ou prefere a gente conversar mais antes?",
  },
  {
    id: "followup_dia4",
    label: "Follow-up dia 4 (escassez)",
    stage: "tentativa_contato",
    text: "{nome}, uma operadora soltou condição especial essa semana com desconto na adesão. Se tiver interesse me avisa que vejo se seu perfil se encaixa antes de vencer o prazo",
  },
  {
    id: "followup_dia7",
    label: "Follow-up dia 7 (social proof)",
    stage: "tentativa_contato",
    text: "Oi {nome}! Essa semana fechei plano pra 3 famílias com perfil parecido com o seu. Se ainda fizer sentido pra você, me chama que monto as opções rapidinho",
  },
  {
    id: "followup_dia14",
    label: "Follow-up dia 14 (despedida)",
    stage: "tentativa_contato",
    text: "{nome}, vou encerrar seu atendimento por aqui pra não ficar te incomodando. Se no futuro precisar de plano de saúde, pode me chamar que te atendo na hora. Fica bem!",
  },

  // Cotação enviada
  {
    id: "cotacao_lembrete",
    label: "Lembrete de cotação",
    stage: "cotacao_enviada",
    text: "Oi {nome}! Te mandei a cotação da {operadora}. Conseguiu dar uma olhada? Se quiser ajustar valor ou comparar com outra operadora, me fala",
  },
  {
    id: "cotacao_duvidas",
    label: "Tirar dúvidas",
    stage: "cotacao_enviada",
    text: "{nome}, ficou com alguma dúvida sobre a cotação? Posso explicar cobertura, carência, rede... é só perguntar",
  },
  {
    id: "cotacao_prazo",
    label: "Prazo especial",
    stage: "cotacao_enviada",
    text: "Oi {nome}, a condição especial da {operadora} vale até {prazo}. Quer que eu trave essa condição pra você?",
  },

  // Cotação aprovada
  {
    id: "aprovada_docs",
    label: "Solicitar documentos",
    stage: "cotacao_aprovada",
    text: "Boa {nome}! Pra seguir com o plano {operadora} ({vidas} vidas), preciso de uns documentos. Te mando a lista?",
  },

  // Documentação completa
  {
    id: "docs_confirmacao",
    label: "Confirmação de docs",
    stage: "documentacao_completa",
    text: "Oi {nome}, recebi tudo certinho. Vou encaminhar pra {operadora} analisar. Te aviso assim que tiver retorno",
  },
  {
    id: "docs_pendente",
    label: "Documento pendente",
    stage: "documentacao_completa",
    text: "{nome}, pra fechar com a {operadora} ainda falta um documento. Consegue me mandar? Assim dou entrada rapidinho",
  },

  // Em emissão
  {
    id: "emissao_status",
    label: "Status da emissão",
    stage: "em_emissao",
    text: "Oi {nome}, seu plano {operadora} tá em emissão. Assim que sair o número da proposta te aviso aqui",
  },

  // Aguardando implantação
  {
    id: "implantacao_prazo",
    label: "Prazo de implantação",
    stage: "aguardando_implantacao",
    text: "{nome}, seu plano {operadora} foi aprovado! Previsão de ativação até {prazo}. Qualquer novidade te chamo aqui",
  },

  // Retrabalho
  {
    id: "retrabalho_retomada",
    label: "Retomada de contato",
    stage: "retrabalho",
    text: "Oi {nome}, faz um tempo que a gente conversou sobre plano de saúde. Surgiu alguma novidade? Tenho condições novas que podem fazer sentido pra você",
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
