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
  { id: "apresentacao", label: "apresentação humanizada", ask_hint: "se apresentar e perguntar como pode ajudar", fields: [], synthetic: true },
  { id: "nome",         label: "nome do contato",          ask_hint: "perguntar o nome do cliente",                fields: ["nome"] },
  { id: "tipo",         label: "tipo de cliente (PF/MEI/PME)", ask_hint: "é pra você (PF), MEI ou empresa (PME)?", fields: ["tipo"] },
  { id: "regiao",       label: "cidade/UF",                 ask_hint: "qual cidade/estado?",                       fields: ["regiao"] },
  { id: "vidas_idades", label: "quantidade de vidas + idades", ask_hint: "quantas pessoas vão entrar e qual a faixa de idade?", fields: ["vidas", "faixa_etaria"] },
  { id: "cnpj",         label: "CNPJ (quando PJ/MEI/PME)",  ask_hint: "qual o CNPJ da empresa? (ou se está em abertura)", fields: ["cnpj"],
    applies: (c) => PJ_LIKE.has(String(c.tipo ?? "").toUpperCase()) },
  { id: "objetivo",     label: "objetivo (adesão/troca/redução)", ask_hint: "qual o objetivo? primeiro plano, troca ou reduzir custo?", fields: ["objetivo"] },
  { id: "urgencia",     label: "urgência/prazo",            ask_hint: "pra quando precisa? urgente ou pode planejar?", fields: ["urgencia"] },
  { id: "orcamento",    label: "faixa de orçamento",        ask_hint: "tem uma faixa de orçamento por vida em mente?", fields: ["orcamento"] },
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

  let score: QualScore;
  if (out_of_scope) score = "D";
  else if (completedNonSynthetic.length === stagesNeedingFields.length) score = "A";
  else if (pct >= 70) score = "B";
  else if (filled.length >= 1) score = "C";
  else score = "C";

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