// Pré-seleção determinística de mentes/técnicas a injetar no prompt.
// Hoje injetamos TUDO que está em agent_vendor_profiles + agent_techniques.
// Resultado: 27 mentes diluídas. Aqui filtramos pra 4-7 focadas no contexto.
//
// Heurísticas:
// - Se campanha detectada → usa preferred_brain_ids/technique_ids dela.
// - Caso contrário, classifica o sinal da mensagem do cliente em buckets:
//     "preco", "objetao", "urgencia", "tecnico_ans", "comparacao",
//     "abertura_neutra", "emocional", "duvida_geral"
//   e mapeia para tags/categorias de mentes/técnicas.

export interface BrainRow {
  id: string;
  peso: number;
  notas: string | null;
  vendor_profiles: {
    id: string;
    nome: string;
    origem: string | null;
    tom: string | null;
    estilo: string | null;
    principios: string | null;
    quando_usar: string | null;
    evitar_quando: string | null;
    exemplos_frases: unknown;
  } | null;
}

export interface TechniqueRow {
  prioridade: number;
  notas: string | null;
  sales_techniques: {
    id: string;
    nome: string;
    categoria: string | null;
    descricao: string | null;
    como_aplicar: string;
    gatilho_uso: string | null;
    exemplos: unknown;
  } | null;
}

export type Signal =
  | "preco"
  | "objecao"
  | "urgencia"
  | "tecnico_ans"
  | "comparacao"
  | "abertura_neutra"
  | "emocional"
  | "duvida_geral";

export function classifySignal(msg: string): Signal {
  const m = msg.toLowerCase();
  if (/(preço|preco|valor|caro|barato|orçament|orcament|quanto custa|quanto fica|quanto sai|desconto)/.test(m)) return "preco";
  if (/(não quero|nao quero|não preciso|nao preciso|depois|to ocupado|tô ocupado|sem interesse|para de|pare de)/.test(m)) return "objecao";
  if (/(urgente|hoje|agora|amanhã|amanha|asap|rápido|rapido|emergência|emergencia|cirurgia|internad|uti|avc|infart)/.test(m)) return "urgencia";
  if (/(carência|carencia|cpt|coparticipa|portabil|ans|reajuste|cobertura|reembolso)/.test(m)) return "tecnico_ans";
  if (/(comparar|diferença|diferenca|melhor que|amil|bradesco|sulamerica|sul america|hapvida|notredame|unimed|porto)/.test(m)) return "comparacao";
  if (/(triste|preocupad|medo|nervos|ansios|sofrend|chorando)/.test(m)) return "emocional";
  if (/(oi|olá|ola|bom dia|boa tarde|boa noite|tudo bem|tudo bom|e ai)/.test(m) && msg.trim().split(/\s+/).length <= 4) return "abertura_neutra";
  return "duvida_geral";
}

// Mapa de keywords que devem aparecer em vendor_profile.nome OU origem OU principios
const SIGNAL_BRAIN_KEYWORDS: Record<Signal, string[]> = {
  preco: ["chris voss", "cialdini", "ancoragem", "ancorar", "negocia", "voss", "preço", "preco", "valor", "objeção"],
  objecao: ["voss", "cialdini", "ackerman", "objeção", "objecao", "resistência", "resistencia", "tactical empathy", "empatia"],
  urgencia: ["sandler", "spin", "urgência", "urgencia", "dor", "consequência", "consequencia"],
  tecnico_ans: ["consultivo", "técnico", "tecnico", "expert", "autoridade", "ans", "regulament"],
  comparacao: ["challenger", "diferenciação", "diferenciacao", "valor único", "valor unico", "consultivo"],
  emocional: ["voss", "tactical empathy", "empatia", "label", "labeling", "espelho", "mirror"],
  abertura_neutra: ["spin", "rapport", "consultivo", "calor", "humano"],
  duvida_geral: [], // injeta os top-5 por peso
};

const SIGNAL_TECHNIQUE_KEYWORDS: Record<Signal, string[]> = {
  preco: ["ancoragem", "ancora", "ackerman", "preço", "preco", "valor", "negocia"],
  objecao: ["mirror", "label", "espelho", "tactical empathy", "objeção", "objecao", "framing"],
  urgencia: ["spin", "implicação", "implicacao", "consequência", "consequencia", "dor", "urgência", "urgencia"],
  tecnico_ans: ["autoridade", "consultivo", "expert", "ans"],
  comparacao: ["diferenciação", "diferenciacao", "challenger", "valor único", "valor unico"],
  emocional: ["mirror", "label", "espelho", "tactical empathy", "empatia"],
  abertura_neutra: ["spin", "rapport", "open question", "pergunta aberta"],
  duvida_geral: [],
};

function matchKeywords(text: string | null | undefined, kws: string[]): boolean {
  if (!text || !kws.length) return false;
  const t = text.toLowerCase();
  return kws.some((k) => t.includes(k));
}

export function pruneBrains(
  all: BrainRow[],
  signal: Signal,
  preferred_ids: string[] = [],
  max = 5,
): BrainRow[] {
  if (!all?.length) return [];

  // 1) Se a campanha forçou IDs preferidos, esses vão primeiro
  if (preferred_ids.length) {
    const preferred = all.filter((b) => b.vendor_profiles && preferred_ids.includes(b.vendor_profiles.id));
    if (preferred.length) return preferred.slice(0, max);
  }

  // 2) Filtra por sinal
  const kws = SIGNAL_BRAIN_KEYWORDS[signal];
  if (kws.length) {
    const scored = all
      .filter((b) => b.vendor_profiles)
      .map((b) => {
        const v = b.vendor_profiles!;
        const corpus = `${v.nome} ${v.origem ?? ""} ${v.principios ?? ""} ${v.quando_usar ?? ""}`;
        const hit = matchKeywords(corpus, kws);
        return { row: b, score: (hit ? 100 : 0) + b.peso };
      })
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, max).map((s) => s.row);
  }

  // 3) Fallback: top por peso
  return [...all]
    .filter((b) => b.vendor_profiles)
    .sort((a, b) => b.peso - a.peso)
    .slice(0, max);
}

export function pruneTechniques(
  all: TechniqueRow[],
  signal: Signal,
  preferred_ids: string[] = [],
  max = 4,
): TechniqueRow[] {
  if (!all?.length) return [];

  if (preferred_ids.length) {
    const preferred = all.filter((t) => t.sales_techniques && preferred_ids.includes(t.sales_techniques.id));
    if (preferred.length) return preferred.slice(0, max);
  }

  const kws = SIGNAL_TECHNIQUE_KEYWORDS[signal];
  if (kws.length) {
    const scored = all
      .filter((t) => t.sales_techniques)
      .map((t) => {
        const s = t.sales_techniques!;
        const corpus = `${s.nome} ${s.categoria ?? ""} ${s.descricao ?? ""} ${s.como_aplicar} ${s.gatilho_uso ?? ""}`;
        const hit = matchKeywords(corpus, kws);
        return { row: t, score: (hit ? 100 : 0) + t.prioridade };
      })
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, max).map((s) => s.row);
  }

  return [...all]
    .filter((t) => t.sales_techniques)
    .sort((a, b) => b.prioridade - a.prioridade)
    .slice(0, max);
}