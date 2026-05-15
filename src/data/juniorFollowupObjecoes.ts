/**
 * Cadência de follow-up e respostas a objeções — Agente Junior
 */

// ============================================================
// 3. CADÊNCIA DE FOLLOW-UP (5 toques)
// ============================================================

export interface FollowUpToque {
  id: string;
  dia: string;
  abordagem: string;
  texto: string;
  nota_interna: string;
}

export const FOLLOWUP_CADENCIA: FollowUpToque[] = [
  {
    id: "followup_4h",
    dia: "Dia 1 (4h depois)",
    abordagem: "Curiosidade",
    texto: "Oi {nome}! Só pra não perder o fio da conversa — me falta só uma info pra montar suas opções. Quando puder me responder a gente continua rapidinho",
    nota_interna: "Abordagem: curiosidade. Faz o lead querer saber o que falta.",
  },
  {
    id: "followup_dia2",
    dia: "Dia 2",
    abordagem: "Valor / benefício",
    texto: "Oi {nome}, tudo bem? Separei umas opções que acho que vão te surpreender no custo-benefício. Quer que eu te mande ou prefere a gente conversar mais antes?",
    nota_interna: "Abordagem: valor. Mostra que já tem algo pronto, gera vontade de ver.",
  },
  {
    id: "followup_dia4",
    dia: "Dia 4",
    abordagem: "Escassez leve",
    texto: "{nome}, uma operadora soltou condição especial essa semana com desconto na adesão. Se tiver interesse me avisa que vejo se seu perfil se encaixa antes de vencer o prazo",
    nota_interna: "Abordagem: escassez. Urgência real mas sem pressão exagerada.",
  },
  {
    id: "followup_dia7",
    dia: "Dia 7",
    abordagem: "Prova social",
    texto: "Oi {nome}! Essa semana fechei plano pra 3 famílias com perfil parecido com o seu. Se ainda fizer sentido pra você, me chama que monto as opções rapidinho",
    nota_interna: "Abordagem: prova social. Mostra que outros estão fechando, gera FOMO leve.",
  },
  {
    id: "followup_dia14",
    dia: "Dia 14 (último)",
    abordagem: "Despedida respeitosa",
    texto: "{nome}, vou encerrar seu atendimento por aqui pra não ficar te incomodando. Se no futuro precisar de plano de saúde, pode me chamar que te atendo na hora. Fica bem!",
    nota_interna: "Abordagem: despedida. Respeita o lead, mas deixa porta aberta. Muitos respondem nesse toque.",
  },
];

// ============================================================
// 4. RESPOSTAS PARA OBJEÇÕES COMUNS
// ============================================================

export interface ObjecaoResposta {
  id: string;
  gatilho: string;
  variantes_gatilho: string[];
  resposta: string;
  resposta_alternativa?: string;
  nota_interna: string;
}

export const OBJECOES_RESPOSTAS: ObjecaoResposta[] = [
  {
    id: "obj_caro",
    gatilho: "Tá caro",
    variantes_gatilho: ["muito caro", "não tenho esse valor", "acima do meu orçamento", "pesado"],
    resposta: "Entendo. Me fala qual faixa seria confortável pra você? Tenho opções em diferentes níveis de cobertura, consigo ajustar sem te empurrar algo que não cabe no bolso",
    resposta_alternativa: "Esse valor é pra cobertura completa. Se quiser posso montar uma opção mais enxuta que cabe melhor. Qual seria o teto pra você?",
    nota_interna: "Nunca invalidar a objeção. Perguntar o teto e oferecer alternativa.",
  },
  {
    id: "obj_pensar",
    gatilho: "Vou pensar",
    variantes_gatilho: ["preciso pensar", "vou analisar", "deixa eu ver", "vou conversar com minha esposa"],
    resposta: "Claro, sem pressa. Só pra eu te ajudar melhor quando decidir: tem alguma dúvida específica ou é mais questão de momento mesmo?",
    resposta_alternativa: "Tranquilo! Se quiser posso te mandar um resumo comparativo pra facilitar a análise. Ajuda?",
    nota_interna: "Respeitar mas tentar identificar a objeção real por trás do 'vou pensar'.",
  },
  {
    id: "obj_ja_tem_corretor",
    gatilho: "Já tenho corretor",
    variantes_gatilho: ["já tenho quem me atende", "meu corretor já cuida", "já tô sendo atendido"],
    resposta: "Boa, ter corretor de confiança é importante. Se algum dia quiser uma segunda opinião ou comparar condições, pode me chamar. Sem compromisso nenhum",
    nota_interna: "Não competir diretamente. Plantar semente pra futuro.",
  },
  {
    id: "obj_nao_agora",
    gatilho: "Não preciso agora",
    variantes_gatilho: ["agora não", "mais pra frente", "não é prioridade", "talvez mês que vem"],
    resposta: "De boa! Posso te chamar daqui a 30 dias pra ver se faz mais sentido? Assim você não precisa lembrar de me procurar",
    resposta_alternativa: "Entendi. Só fica ligado que plano de saúde tem carência, então quanto antes contratar, antes pode usar. Mas sem pressão, me chama quando quiser",
    nota_interna: "Agendar retorno e plantar semente de urgência leve (carência).",
  },
  {
    id: "obj_email",
    gatilho: "Me manda por email",
    variantes_gatilho: ["manda no email", "prefiro por email", "pode enviar por email"],
    resposta: "Mando sim! Me passa seu email que envio a cotação detalhada. Vou te mandar em PDF bem organizado. Depois a gente tira dúvidas por aqui mesmo, beleza?",
    nota_interna: "Aceitar mas manter o WhatsApp como canal de conversa.",
  },
  {
    id: "obj_onde",
    gatilho: "Vocês são de onde?",
    variantes_gatilho: ["onde fica o escritório", "qual a empresa", "é de qual cidade"],
    resposta: "Sou consultor autorizado, atendo online e presencial. Trabalho com as principais operadoras: Bradesco, SulAmérica, Amil, Unimed, entre outras. De qual região você é? Assim vejo as melhores opções aí",
    nota_interna: "Responder e redirecionar pra qualificação (região).",
  },
  {
    id: "obj_diferencial",
    gatilho: "Qual a diferença de comprar com vocês?",
    variantes_gatilho: ["por que comprar com você", "qual a vantagem", "o que vocês fazem de diferente"],
    resposta: "O plano e o preço são os mesmos, isso é tabelado. A diferença é o atendimento: eu te ajudo a escolher certo, acompanho a implantação e fico como seu consultor pra qualquer problema depois. Sem custo extra pra você",
    nota_interna: "Focar em serviço e acompanhamento, não em preço.",
  },
  {
    id: "obj_carencia",
    gatilho: "Tem carência?",
    variantes_gatilho: ["qual a carência", "quanto tempo de carência", "demora pra usar"],
    resposta: "Depende do plano e da sua situação. Se você já tem plano ativo há mais de 2 anos, dá pra fazer portabilidade sem carência. Se não, a carência padrão é 24h pra urgência, 30 dias pra consultas e 180 dias pra cirurgias. Você tem plano hoje?",
    nota_interna: "Explicar e aproveitar pra qualificar (tem plano atual?).",
  },
  {
    id: "obj_rede",
    gatilho: "Cobre tal hospital/médico?",
    variantes_gatilho: ["tem o hospital X", "cobre o Dr. fulano", "atende no Einstein", "tem rede tal"],
    resposta: "Consigo verificar pra você. Me fala o nome do hospital ou médico e a cidade que eu checo na hora qual plano cobre",
    nota_interna: "Não chutar. Pedir o nome específico e verificar.",
  },
  {
    id: "obj_usar_amanha",
    gatilho: "Posso usar amanhã?",
    variantes_gatilho: ["consigo usar já", "quando posso usar", "ativa na hora"],
    resposta: "Pra urgência e emergência a carência é de 24h. Pra consultas e exames, 30 dias na maioria dos planos. Se você já tem plano ativo, com portabilidade pode usar tudo de imediato. Você tem plano hoje?",
    nota_interna: "Ser honesto sobre carência mas mostrar saída (portabilidade).",
  },
];

export function findObjecaoResposta(mensagemLead: string): ObjecaoResposta | undefined {
  const lower = mensagemLead.toLowerCase();
  return OBJECOES_RESPOSTAS.find(
    (o) =>
      lower.includes(o.gatilho.toLowerCase()) ||
      o.variantes_gatilho.some((v) => lower.includes(v.toLowerCase()))
  );
}

export function getFollowUpByDia(id: string): FollowUpToque | undefined {
  return FOLLOWUP_CADENCIA.find((f) => f.id === id);
}
