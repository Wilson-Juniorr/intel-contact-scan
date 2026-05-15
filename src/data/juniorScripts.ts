/**
 * Scripts completos do agente Junior — Pré-qualificador
 * Inclui: scripts de áudio, fluxos por cenário, cadência de follow-up, respostas a objeções
 */

// ============================================================
// 1. SCRIPTS DE ÁUDIO (3 variações por trigger)
// ============================================================

export interface AudioScript {
  trigger: string;
  variacao: number;
  texto: string;
  duracao_estimada: string;
}

export const AUDIO_SCRIPTS: AudioScript[] = [
  // --- APRESENTACAO (Turn 2, lead engajou) ---
  {
    trigger: "apresentacao",
    variacao: 1,
    texto: "Oi, aqui é o Junior. Sou consultor de planos de saúde, trabalho com as principais operadoras do mercado. Me conta o que você tá buscando que eu te ajudo a encontrar a melhor opção.",
    duracao_estimada: "10s",
  },
  {
    trigger: "apresentacao",
    variacao: 2,
    texto: "E aí, tudo bem? Junior aqui. Trabalho com planos de saúde há alguns anos, conheço bem as operadoras da região. Vou te ajudar a achar algo que faça sentido pro seu perfil.",
    duracao_estimada: "11s",
  },
  {
    trigger: "apresentacao",
    variacao: 3,
    texto: "Oi, aqui é o Junior mesmo. Sou especialista em planos de saúde, atendo tanto pessoa física quanto empresa. Me fala mais da sua situação que a gente resolve.",
    duracao_estimada: "9s",
  },

  // --- ENTENDIMENTO (4+ campos preenchidos) ---
  {
    trigger: "entendimento",
    variacao: 1,
    texto: "Beleza, já entendi bem sua situação. Com essas informações eu já consigo filtrar as melhores opções pra você, sem perder seu tempo com coisa que não faz sentido.",
    duracao_estimada: "10s",
  },
  {
    trigger: "entendimento",
    variacao: 2,
    texto: "Perfeito, já tenho uma boa visão do que você precisa. Vou cruzar isso com as tabelas que tenho aqui e te mostrar só o que realmente encaixa no seu perfil.",
    duracao_estimada: "10s",
  },
  {
    trigger: "entendimento",
    variacao: 3,
    texto: "Ótimo, já captei. Com esses dados eu consigo ser bem assertivo na cotação. Vou montar as opções certas pra sua realidade, sem enrolação.",
    duracao_estimada: "8s",
  },

  // --- QUALIFICACAO_COMPLETA (tipo + vidas + faixa etária + região) ---
  {
    trigger: "qualificacao_completa",
    variacao: 1,
    texto: "Pronto, já tenho tudo que precisava. Vou montar as melhores opções pro seu perfil agora e te mando ainda hoje. Qualquer dúvida é só chamar aqui.",
    duracao_estimada: "9s",
  },
  {
    trigger: "qualificacao_completa",
    variacao: 2,
    texto: "Perfeito, com essas informações eu já consigo montar uma cotação personalizada. Vou preparar e te envio em breve com tudo detalhado.",
    duracao_estimada: "9s",
  },
  {
    trigger: "qualificacao_completa",
    variacao: 3,
    texto: "Show, tenho tudo aqui. Vou rodar as simulações e te mando as opções que mais fazem sentido. Fica de olho que já já te chamo.",
    duracao_estimada: "8s",
  },

  // --- FOLLOW_UP_DIA2 (24-48h sem resposta) ---
  {
    trigger: "follow_up_dia2",
    variacao: 1,
    texto: "Oi, aqui é o Junior. Vi que a gente tava conversando sobre o plano. Fica tranquilo, sem pressa. Quando puder continuar é só me chamar aqui.",
    duracao_estimada: "9s",
  },
  {
    trigger: "follow_up_dia2",
    variacao: 2,
    texto: "E aí, tudo certo? Junior aqui. Só passando pra ver se surgiu alguma dúvida sobre o que a gente conversou. Tô por aqui quando precisar.",
    duracao_estimada: "8s",
  },
  {
    trigger: "follow_up_dia2",
    variacao: 3,
    texto: "Oi, Junior aqui. Sei que o dia a dia é corrido. Quando tiver um minutinho pra gente continuar sobre o plano, me dá um toque.",
    duracao_estimada: "8s",
  },

  // --- FOLLOW_UP_DIA5 (4-5 dias sem resposta) ---
  {
    trigger: "follow_up_dia5",
    variacao: 1,
    texto: "Oi, Junior aqui. Tô com algumas novidades de tabela que podem ser interessantes pro seu perfil. Se quiser dar uma olhada, me chama que te mostro.",
    duracao_estimada: "9s",
  },
  {
    trigger: "follow_up_dia5",
    variacao: 2,
    texto: "E aí, tudo bem? Saiu uma condição especial essa semana em algumas operadoras. Se ainda tiver interesse, posso te mostrar o que mudou.",
    duracao_estimada: "9s",
  },
  {
    trigger: "follow_up_dia5",
    variacao: 3,
    texto: "Oi, aqui é o Junior. Última vez que conversamos você tava vendo sobre plano de saúde. Se mudou de ideia tá tudo certo, mas se quiser retomar, tô aqui.",
    duracao_estimada: "10s",
  },
];

export function getAudioScripts(trigger: string): AudioScript[] {
  return AUDIO_SCRIPTS.filter((s) => s.trigger === trigger);
}

export function getRandomAudioScript(trigger: string): AudioScript | undefined {
  const scripts = getAudioScripts(trigger);
  if (!scripts.length) return undefined;
  return scripts[Math.floor(Math.random() * scripts.length)];
}
