// Qualificação estruturada do junior-sdr.
// Determinístico: NÃO usa LLM — calcula a partir do que foi efetivamente coletado.

export type QualScore = "A" | "B" | "C" | "D";

export const REQUIRED_FIELDS = [
  "tipo",          // PF | PJ | MEI
  "vidas",         // número
  "faixa_etaria",  // ex: "0-18", "19-43", "59+", "mista"
  "plano_atual",   // { tem: bool, operadora?: string } — "nao tem" também é resposta válida
  "regiao",        // cidade/estado
  "objetivo",      // preco | rede | cobertura
] as const;

export type RequiredField = typeof REQUIRED_FIELDS[number];

const TIPOS_VALIDOS = new Set(["PF", "PJ", "MEI"]);
const OBJETIVOS_VALIDOS = new Set(["preco", "preço", "rede", "cobertura"]);

function isFilled(key: RequiredField, coletado: Record<string, unknown>): boolean {
  const v = coletado[key];
  if (v === undefined || v === null || v === "") return false;
  switch (key) {
    case "tipo": {
      const t = String(v).toUpperCase();
      return TIPOS_VALIDOS.has(t);
    }
    case "vidas": {
      const n = Number(v);
      return !isNaN(n) && n > 0 && n <= 999;
    }
    case "plano_atual": {
      // Aceita objeto { tem: bool, operadora?: string } OU string ("nao", "não tenho", "amil"...)
      if (typeof v === "string") return v.trim().length >= 2;
      if (typeof v === "object") {
        const obj = v as Record<string, unknown>;
        if ("tem" in obj && obj.tem === false) return true; // declarou que não tem
        if (typeof obj.operadora === "string" && obj.operadora.trim().length >= 2) return true;
      }
      return false;
    }
    case "objetivo": {
      const s = String(v).toLowerCase();
      return OBJETIVOS_VALIDOS.has(s) || s.length >= 3;
    }
    default:
      return String(v).trim().length >= 2;
  }
}

export interface QualProgress {
  filled: RequiredField[];
  missing: RequiredField[];
  next_question_field: RequiredField | null;
  pct: number; // 0-100
  score: QualScore;
  out_of_scope: boolean;
  reasons: string[];
}

/**
 * Regras de score:
 *  D = fora de escopo (tipo inválido declarado, vidas = 0, ou objetivo "só curiosidade").
 *  A = todos os 6 campos preenchidos.
 *  B = 4-5 campos preenchidos.
 *  C = 1-3 campos preenchidos (curioso/frio).
 *  Apenas A aciona handoff para corretor humano.
 */
export function evaluateQualification(
  coletado: Record<string, unknown>,
  signals: { explicit_out_of_scope?: boolean } = {},
): QualProgress {
  const reasons: string[] = [];
  const filled: RequiredField[] = [];
  const missing: RequiredField[] = [];

  for (const f of REQUIRED_FIELDS) {
    if (isFilled(f, coletado)) filled.push(f);
    else missing.push(f);
  }

  // Detecção de "fora de escopo"
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
  const vidasRaw = coletado.vidas;
  if (vidasRaw !== undefined && vidasRaw !== null && vidasRaw !== "") {
    const n = Number(vidasRaw);
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

  let score: QualScore;
  if (out_of_scope) score = "D";
  else if (filled.length === REQUIRED_FIELDS.length) score = "A";
  else if (filled.length >= 4) score = "B";
  else if (filled.length >= 1) score = "C";
  else score = "C";

  // Próximo campo a perguntar (1 por vez, na ordem definida)
  const next_question_field = missing[0] ?? null;
  const pct = Math.round((filled.length / REQUIRED_FIELDS.length) * 100);

  return { filled, missing, next_question_field, pct, score, out_of_scope, reasons };
}

export function qualProgressBlock(progress: QualProgress): string {
  const labels: Record<RequiredField, string> = {
    tipo: "tipo (PF/PJ/MEI)",
    vidas: "quantidade de vidas",
    faixa_etaria: "faixa etária principal",
    plano_atual: "tem plano atual? qual operadora?",
    regiao: "região/cidade",
    objetivo: "objetivo principal (preço, rede, cobertura)",
  };
  const proxima = progress.next_question_field
    ? labels[progress.next_question_field]
    : "—";
  return (
    "\n\n═══ QUALIFICAÇÃO ESTRUTURADA (DETERMINÍSTICA) ═══\n" +
    `PROGRESSO: ${progress.filled.length}/${REQUIRED_FIELDS.length} (${progress.pct}%)\n` +
    `JÁ_COLETADO: ${JSON.stringify(progress.filled)}\n` +
    `FALTA_COLETAR: ${JSON.stringify(progress.missing)}\n` +
    `PROXIMA_PERGUNTA_OBRIGATORIA: ${proxima}\n` +
    `SCORE_ATUAL: ${progress.score} (A=pronto p/ corretor, B=quase, C=curioso, D=fora de escopo)\n` +
    `OUT_OF_SCOPE: ${progress.out_of_scope ? "SIM — " + progress.reasons.join(", ") : "não"}\n` +
    "\n⚠️ REGRAS RÍGIDAS DE QUALIFICAÇÃO:\n" +
    "1. Faça SOMENTE UMA pergunta por turno — exatamente o campo PROXIMA_PERGUNTA_OBRIGATORIA acima.\n" +
    "2. NUNCA invente dados que o cliente ainda não disse. Se não tem certeza, pergunte.\n" +
    "3. NÃO confirme handoff/cotação humana enquanto SCORE não for A.\n" +
    "4. Se SCORE = D (fora de escopo), encerre com cordialidade — não force qualificação.\n" +
    "5. Reporte no METADATA o JSON `coletado` apenas com o que o cliente DECLAROU explicitamente neste turno.\n"
  );
}