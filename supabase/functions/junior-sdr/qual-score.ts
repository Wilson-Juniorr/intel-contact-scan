// ═══════════════════════════════════════════════════════════════════════════
// State machine determinístico de pré-qualificação do junior-sdr.
// 9 etapas ordenadas — 1 pergunta por turno, retomada sem perder contexto.
//
// Estado e dados parciais são persistidos em:
//   - agent_conversations.conversation_state (snapshot por turno)
//   - lead_memory.structured_json            (memória durável entre turnos)
//
// O LLM NÃO escolhe a próxima pergunta — quem manda é evaluateQualification().
// ═══════════════════════════════════════════════════════════════════════════

export type QualScore = "A" | "B" | "C" | "D";

/** Slugs canônicos de cada etapa do funil de pré-qualificação. */
export type StageId =
  | "apresentacao"
  | "nome"
  | "tipo"
  | "regiao"
  | "vidas_idades"
  | "cnpj"
  | "objetivo"
  | "urgencia"
  | "orcamento";

/** Todos os campos potencialmente coletados (incluindo condicionais). */
export type RequiredField =
  | "nome"
  | "tipo"
  | "regiao"
  | "vidas"
  | "faixa_etaria"
  | "cnpj"
  | "objetivo"
  | "urgencia"
  | "orcamento";

/** Compat: alguns callers legados ainda iteram REQUIRED_FIELDS. */
export const REQUIRED_FIELDS: readonly RequiredField[] = [
  "nome",
  "tipo",
  "regiao",
  "vidas",
  "faixa_etaria",
  "objetivo",
  "urgencia",
  "orcamento",
] as const;

const TIPOS_VALIDOS = new Set(["PF", "PJ", "MEI", "PME"]);
const PJ_LIKE = new Set(["PJ", "MEI", "PME"]);

/* ─────────────── Validações por campo ─────────────── */

function isStr(v: unknown, min = 2): boolean {
  return typeof v === "string" && v.trim().length >= min;
}

function isFilled(field: RequiredField, c: Record<string, unknown>): boolean {
  const v = c[field];
  if (v === undefined || v === null || v === "") return false;
  switch (field) {
    case "nome":
      // Nome real (não placeholder/telefone)
      return isStr(v, 2) && !/^\+?\d+$/.test(String(v).trim());
    case "tipo":
      return TIPOS_VALIDOS.has(String(v).toUpperCase());
    case "regiao":
      return isStr(v, 2);
    case "vidas": {
      const n = Number(v);
      return !isNaN(n) && n > 0 && n <= 999;
    }
    case "faixa_etaria":
      return isStr(v, 2);
    case "cnpj": {
      // Aceita CNPJ formatado/puro com 14 dígitos OU "isento/em abertura" como string >=4
      if (typeof v === "object") {
        const obj = v as Record<string, unknown>;
        if (obj.tem === false) return true; // declarou que não tem ainda
        if (typeof obj.numero === "string" && obj.numero.replace(/\D/g, "").length === 14) return true;
        if (typeof obj.status === "string" && obj.status.trim().length >= 4) return true;
        return false;
      }
      const s = String(v).trim();
      const digits = s.replace(/\D/g, "");
      if (digits.length === 14) return true;
      return s.length >= 4; // "em abertura", "isento", "pendente"
    }
    case "objetivo":
      return isStr(v, 3);
    case "urgencia":
      return isStr(v, 2);
    case "orcamento":
      // Aceita número, faixa textual ou "sem teto definido"
      if (typeof v === "number") return v > 0;
      return isStr(v, 2);
  }
}

/* ─────────────── Definição das etapas ─────────────── */

interface StageDef {
  id: StageId;
  label: string;          // descrição humana curta
  ask_hint: string;       // dica para o LLM formular a pergunta
  fields: RequiredField[]; // campos cujo preenchimento marca a etapa como completa
  /** Se retorna false, a etapa é PULADA (não conta como pendente). */
  applies?: (coletado: Record<string, unknown>) => boolean;
  /** Se true, a etapa é considerada completa quando turn_number >= 1. */
  synthetic?: boolean;
}

export const STAGES: readonly StageDef[] = [
  { id: "apresentacao", label: "apresentação humanizada", ask_hint: "se apresentar de forma calorosa e perguntar o que ele tá buscando", fields: [], synthetic: true },
  { id: "tipo",         label: "tipo de cliente (PF/MEI/PME)", ask_hint: "é pra você (pessoa física), MEI ou empresa?", fields: ["tipo"] },
  { id: "vidas_idades", label: "quantidade de vidas + idades", ask_hint: "quantas pessoas vão entrar no plano e qual a faixa de idade?", fields: ["vidas", "faixa_etaria"] },
  { id: "regiao",       label: "cidade/UF",                 ask_hint: "qual cidade ou região?",                       fields: ["regiao"] },
  { id: "nome",         label: "nome do contato",          ask_hint: "como posso te chamar? / qual seu nome?",        fields: ["nome"] },
  { id: "cnpj",         label: "CNPJ (quando PJ/MEI/PME)",  ask_hint: "qual o CNPJ da empresa? (ou se está em abertura)", fields: ["cnpj"],
    applies: (c) => PJ_LIKE.has(String(c.tipo ?? "").toUpperCase()) },
  { id: "objetivo",     label: "objetivo (adesão/troca/redução)", ask_hint: "é primeiro plano, troca de operadora ou quer reduzir custo?", fields: ["objetivo"] },
  { id: "urgencia",     label: "urgência/prazo",            ask_hint: "pra quando precisa? é urgente ou pode planejar com calma?", fields: ["urgencia"] },
  { id: "orcamento",    label: "faixa de orçamento",        ask_hint: "tem uma faixa de valor em mente por pessoa?", fields: ["orcamento"] },
] as const;

/* ─────────────── Resultado ─────────────── */

export interface QualProgress {
  // State machine
  stages_total: number;
  stages_applicable: number;
  stages_completed_ids: StageId[];
  stages_remaining_ids: StageId[];
  current_stage: StageId | null;       // próxima etapa a ser resolvida
  current_stage_label: string | null;
  current_stage_hint: string | null;
  // Campos brutos (compat)
  filled: RequiredField[];
  missing: RequiredField[];
  next_question_field: RequiredField | null;
  pct: number;
  // Score
  score: QualScore;
  out_of_scope: boolean;
  reasons: string[];
  // ─── Score detalhado, auditável (não caixa-preta) ───
  breakdown: QualBreakdown;
  reason_summary: string;
}

export interface QualDimension {
  /** 0-100 */
  score: number;
  /** Sinais positivos que somaram pontos. */
  reasons: string[];
  /** Trechos/valores brutos que justificam a pontuação. */
  evidence: string[];
}

export interface QualBreakdown {
  /** Aderência ao ICP: tipo válido, vidas plausíveis, região informada. */
  fit: QualDimension;
  /** Janela de decisão: urgência + prazo. */
  urgency: QualDimension;
  /** Quantos campos obrigatórios já temos. */
  completeness: QualDimension;
  /** Probabilidade de fechar: orçamento, objetivo claro, sem flags negativas. */
  closing_potential: QualDimension;
  /** Score final agregado (0-100). */
  overall: number;
  /** Pesos usados (auditoria). */
  weights: { fit: number; urgency: number; completeness: number; closing_potential: number };
}

/* ─────────────── Cálculo por dimensão ─────────────── */

function computeFit(c: Record<string, unknown>): QualDimension {
  const reasons: string[] = [];
  const evidence: string[] = [];
  let score = 0;
  const tipo = String(c.tipo ?? "").toUpperCase();
  if (tipo && TIPOS_VALIDOS.has(tipo)) {
    score += 40;
    reasons.push(`tipo_valido:${tipo}`);
    evidence.push(`tipo=${tipo}`);
  }
  if (isFilled("vidas", c)) {
    score += 30;
    reasons.push("vidas_informadas");
    evidence.push(`vidas=${c.vidas}`);
  }
  if (isFilled("regiao", c)) {
    score += 20;
    reasons.push("regiao_informada");
    evidence.push(`regiao=${String(c.regiao).slice(0, 40)}`);
  }
  if (isFilled("faixa_etaria", c)) {
    score += 10;
    reasons.push("faixa_etaria_informada");
    evidence.push(`faixa_etaria=${String(c.faixa_etaria).slice(0, 40)}`);
  }
  return { score: Math.min(100, score), reasons, evidence };
}

function computeUrgency(c: Record<string, unknown>): QualDimension {
  const reasons: string[] = [];
  const evidence: string[] = [];
  let score = 0;
  const u = String(c.urgencia ?? "").toLowerCase();
  if (u) {
    evidence.push(`urgencia="${u.slice(0, 60)}"`);
    if (/(urgent|hoje|amanh|essa semana|esta semana|imediat|agora|ja precis)/.test(u)) {
      score = 100; reasons.push("urgencia_alta");
    } else if (/(este m[eê]s|esse m[eê]s|pr[oó]ximos? \d* ?dias|15 dias|30 dias|r[aá]pido)/.test(u)) {
      score = 75; reasons.push("urgencia_media");
    } else if (/(planeja|sem pressa|pesquisa|ver|olhar|estudar|futuro|daqui a)/.test(u)) {
      score = 35; reasons.push("urgencia_baixa");
    } else {
      score = 60; reasons.push("urgencia_declarada_indefinida");
    }
  } else {
    reasons.push("urgencia_nao_informada");
  }
  return { score, reasons, evidence };
}

function computeCompleteness(
  applicable: readonly StageDef[],
  completedNonSynthetic: StageId[],
  c: Record<string, unknown>,
): QualDimension {
  const reasons: string[] = [];
  const evidence: string[] = [];
  const stagesNeeding = applicable.filter((s) => !s.synthetic);
  const total = stagesNeeding.length;
  const done = completedNonSynthetic.length;
  const score = total === 0 ? 100 : Math.round((done / total) * 100);
  reasons.push(`${done}/${total}_etapas_completas`);
  for (const f of REQUIRED_FIELDS) {
    if (isFilled(f, c)) evidence.push(`${f}=ok`);
  }
  return { score, reasons, evidence };
}

function computeClosingPotential(
  c: Record<string, unknown>,
  out_of_scope: boolean,
): QualDimension {
  const reasons: string[] = [];
  const evidence: string[] = [];
  if (out_of_scope) {
    reasons.push("fora_de_escopo_zera_potencial");
    return { score: 0, reasons, evidence };
  }
  let score = 0;
  if (isFilled("orcamento", c)) {
    score += 40;
    reasons.push("orcamento_declarado");
    evidence.push(`orcamento=${String(c.orcamento).slice(0, 60)}`);
  }
  const obj = String(c.objetivo ?? "").toLowerCase();
  if (obj && isFilled("objetivo", c)) {
    if (/(ades[aã]o|contrat|fech|primeiro plano|nunca tive)/.test(obj)) {
      score += 35; reasons.push("objetivo_alta_intencao");
    } else if (/(troca|migra|portab|reduz|economi|melhor)/.test(obj)) {
      score += 30; reasons.push("objetivo_media_intencao");
    } else {
      score += 15; reasons.push("objetivo_baixa_intencao");
    }
    evidence.push(`objetivo="${obj.slice(0, 80)}"`);
  }
  // CNPJ presente em PJ-like = mais perto de fechar
  const tipo = String(c.tipo ?? "").toUpperCase();
  if (PJ_LIKE.has(tipo) && isFilled("cnpj", c)) {
    score += 25;
    reasons.push("cnpj_validado_pj");
    evidence.push("cnpj=ok");
  } else if (!PJ_LIKE.has(tipo) && tipo === "PF") {
    score += 10;
    reasons.push("pf_sem_dependencia_cnpj");
  }
  return { score: Math.min(100, score), reasons, evidence };
}

function buildReasonSummary(score: QualScore, b: QualBreakdown, oos: boolean, oosReasons: string[]): string {
  if (oos) return `Score D — fora de escopo (${oosReasons.join("; ") || "sinal explícito"})`;
  const parts = [
    `fit ${b.fit.score}`,
    `urgência ${b.urgency.score}`,
    `completude ${b.completeness.score}`,
    `fechamento ${b.closing_potential.score}`,
  ].join(" · ");
  const top = [b.fit, b.urgency, b.completeness, b.closing_potential]
    .flatMap((d) => d.reasons.slice(0, 1))
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
  return `Score ${score} (overall ${b.overall}) — ${parts}${top ? ` | ${top}` : ""}`;
}

export function evaluateQualification(
  coletado: Record<string, unknown>,
  signals: { explicit_out_of_scope?: boolean; turn_number?: number } = {},
): QualProgress {
  const reasons: string[] = [];
  const turn = signals.turn_number ?? 0;

  // 1) Quais etapas se aplicam a este lead?
  const applicable = STAGES.filter((s) => !s.applies || s.applies(coletado));

  // 2) Quais já estão completas?
  const completed: StageId[] = [];
  const remaining: StageId[] = [];
  for (const s of applicable) {
    let done: boolean;
    if (s.synthetic) {
      done = turn >= 1; // apresentação considerada feita após o 1º turno
    } else {
      done = s.fields.every((f) => isFilled(f, coletado));
    }
    (done ? completed : remaining).push(s.id);
  }

  // 3) Próxima etapa = primeira pendente, em ordem
  const next = applicable.find((s) => remaining.includes(s.id)) ?? null;
  const next_question_field: RequiredField | null = next?.fields[0]
    ? (next.fields.find((f) => !isFilled(f, coletado)) ?? next.fields[0])
    : null;

  // 4) Filled / missing brutos (apenas campos das etapas APLICÁVEIS)
  const applicableFields = Array.from(
    new Set(applicable.flatMap((s) => s.fields)),
  ) as RequiredField[];
  const filled = applicableFields.filter((f) => isFilled(f, coletado));
  const missing = applicableFields.filter((f) => !isFilled(f, coletado));

  // 5) Out-of-scope (mantém compat com lógica anterior)
  let out_of_scope = false;
  if (signals.explicit_out_of_scope) {
    out_of_scope = true;
    reasons.push("sinal_explicito_fora_de_escopo");
  }
  const tipoRaw = coletado.tipo;
  if (tipoRaw && !TIPOS_VALIDOS.has(String(tipoRaw).toUpperCase())) {
    out_of_scope = true;
    reasons.push(`tipo_invalido:${tipoRaw}`);
  }
  if (coletado.vidas !== undefined && coletado.vidas !== null && coletado.vidas !== "") {
    const n = Number(coletado.vidas);
    if (isNaN(n) || n <= 0) {
      out_of_scope = true;
      reasons.push("vidas_invalidas");
    }
  }
  const obj = String(coletado.objetivo ?? "").toLowerCase();
  if (obj.includes("curios") || obj.includes("só ver") || obj.includes("so ver")) {
    out_of_scope = true;
    reasons.push("objetivo_apenas_curiosidade");
  }

  // 6) Score (baseado em etapas completadas, não só campos)
  const stagesNeedingFields = applicable.filter((s) => !s.synthetic);
  const completedNonSynthetic = completed.filter(
    (id) => !applicable.find((s) => s.id === id)?.synthetic,
  );
  const pct = stagesNeedingFields.length === 0
    ? 100
    : Math.round((completedNonSynthetic.length / stagesNeedingFields.length) * 100);

  // 6.1) Score multidimensional, auditável
  const fit = computeFit(coletado);
  const urgency = computeUrgency(coletado);
  const completeness = computeCompleteness(applicable, completedNonSynthetic, coletado);
  const closing_potential = computeClosingPotential(coletado, out_of_scope);
  const weights = { fit: 0.25, urgency: 0.20, completeness: 0.30, closing_potential: 0.25 };
  const overall = Math.round(
    fit.score * weights.fit +
    urgency.score * weights.urgency +
    completeness.score * weights.completeness +
    closing_potential.score * weights.closing_potential,
  );
  const breakdown: QualBreakdown = { fit, urgency, completeness, closing_potential, overall, weights };

  let score: QualScore;
  if (out_of_scope) score = "D";
  else if (completedNonSynthetic.length === stagesNeedingFields.length && overall >= 80) score = "A";
  else if (overall >= 65) score = "B";
  else if (overall >= 30 || filled.length >= 1) score = "C";
  else score = "D";

  const reason_summary = buildReasonSummary(score, breakdown, out_of_scope, reasons);

  return {
    stages_total: STAGES.length,
    stages_applicable: applicable.length,
    stages_completed_ids: completed,
    stages_remaining_ids: remaining,
    current_stage: next?.id ?? null,
    current_stage_label: next?.label ?? null,
    current_stage_hint: next?.ask_hint ?? null,
    filled,
    missing,
    next_question_field,
    pct,
    score,
    out_of_scope,
    reasons,
    breakdown,
    reason_summary,
  };
}

/* ─────────────── Bloco injetado no system prompt ─────────────── */

export function qualProgressBlock(p: QualProgress): string {
  const proxima = p.current_stage
    ? `${p.current_stage} — ${p.current_stage_label} (${p.current_stage_hint})`
    : "—";
  const faltamN = p.stages_remaining_ids.filter(
    (id) => !STAGES.find((s) => s.id === id)?.synthetic,
  ).length;
  return (
    "\n\n═══ STATE MACHINE DE PRÉ-QUALIFICAÇÃO (DETERMINÍSTICO) ═══\n" +
    `PROGRESSO: ${p.stages_applicable - p.stages_remaining_ids.length}/${p.stages_applicable} etapas (${p.pct}%)\n` +
    `FALTAM: ${faltamN} etapa(s)\n` +
    `JÁ_COMPLETAS: ${JSON.stringify(p.stages_completed_ids)}\n` +
    `PENDENTES: ${JSON.stringify(p.stages_remaining_ids)}\n` +
    `PROXIMA_ETAPA: ${proxima}\n` +
    `CAMPO_OBRIGATORIO_AGORA: ${p.next_question_field ?? "—"}\n` +
    `SCORE_ATUAL: ${p.score} (A=pronto p/ corretor, B=>=70%, C=parcial, D=fora de escopo)\n` +
    `OUT_OF_SCOPE: ${p.out_of_scope ? "SIM — " + p.reasons.join(", ") : "não"}\n` +
    "\n⚠️ REGRAS RÍGIDAS:\n" +
    "1. Faça SOMENTE UMA pergunta por turno — exatamente o CAMPO_OBRIGATORIO_AGORA.\n" +
    "2. Se o cliente responder algo FORA DE ORDEM (ex: já deu cidade quando você ia perguntar tipo), capture esse dado no METADATA `coletado` e CONTINUE de onde a etapa atual indicar — sem re-perguntar o que ele já disse.\n" +
    "3. NUNCA invente dados. Se não tem certeza, peça confirmação curta.\n" +
    "4. NÃO confirme handoff/cotação humana enquanto SCORE não for A.\n" +
    "5. Se SCORE = D, encerre com cordialidade — não force qualificação.\n" +
    "6. No METADATA, retorne `coletado` apenas com o que o cliente DECLAROU explicitamente neste turno (ou turnos anteriores reafirmados).\n" +
    "7. Quando SCORE for A e for transferir, inclua no METADATA: `urgencia` ('alta'|'media'|'baixa'), `objecao_principal` (ou null), `sugestao_proxima_msg_humana` (até 2 frases).\n"
  );
}