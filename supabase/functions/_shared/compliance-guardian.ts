// Guardião de compliance OBRIGATÓRIO para qualquer mensagem automática
// (pré-qualificação, follow-up, rewarming, etc.) antes de chegar ao UaZapi.
//
// Valida:
//   - termos proibidos (promessa absoluta, urgência falsa, superlativo sem base)
//   - excesso de tamanho
//   - tom agressivo / caps lock / excesso de pontuação
//   - risco LGPD/ANS (dados sensíveis em texto, garantias clínicas indevidas)
//
// Estilo fail-closed: se houver erro inesperado, bloqueia.

export type GuardianViolation = {
  tipo:
    | "termo_proibido"
    | "excesso_tamanho"
    | "tom_agressivo"
    | "risco_lgps_ans"
    | "internal_error";
  detalhe: string;
  trecho?: string;
};

export type GuardianResult =
  | { allowed: true; sanitized?: string }
  | { allowed: false; violations: GuardianViolation[]; suggested_fix?: string };

const MAX_LEN = 1200;

// Promessa absoluta / urgência falsa / superlativo sem base
const FORBIDDEN_PATTERNS: { rx: RegExp; tipo: GuardianViolation["tipo"]; detalhe: string }[] = [
  { rx: /\bgarant(o|ido|ia)\s+(100%|total|absolut|que)/i, tipo: "termo_proibido", detalhe: "promessa absoluta (garantia)" },
  { rx: /\b(100%\s+(aprovado|garantido|certo))\b/i, tipo: "termo_proibido", detalhe: "promessa absoluta (100%)" },
  { rx: /\bsem\s+(carência|car[eê]ncia|risco)\b/i, tipo: "termo_proibido", detalhe: "promessa indevida (sem carência/risco)" },
  { rx: /\b(melhor\s+plano\s+do\s+brasil|n[uú]mero\s*1\s+do\s+mercado|imbat[íi]vel|insuper[áa]vel)\b/i, tipo: "termo_proibido", detalhe: "superlativo sem base" },
  { rx: /\b(últim(a|o)\s+(chance|vaga|oportunidade)|só\s+hoje|expira\s+em\s+\d+\s*(min|h))/i, tipo: "termo_proibido", detalhe: "urgência falsa" },
  { rx: /\bpromoç[ãa]o\s+rel[âa]mpago\b/i, tipo: "termo_proibido", detalhe: "urgência falsa" },
  { rx: /\bcura\b|\btrata\s+qualquer\s+doença\b/i, tipo: "risco_lgps_ans", detalhe: "garantia clínica indevida (ANS)" },
  { rx: /\bcobre\s+tudo\b|\bcobertura\s+(total|ilimitada)\b/i, tipo: "risco_lgps_ans", detalhe: "promessa de cobertura total (ANS)" },
];

// Risco LGPD: pedir/expor dados sensíveis em texto cru
const LGPD_PATTERNS: { rx: RegExp; detalhe: string }[] = [
  { rx: /\bme\s+(envia|manda|passa)\s+(seu|sua)\s+(cpf|rg|cart[ãa]o|senha)/i, detalhe: "solicitação de dado sensível por mensagem" },
  { rx: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, detalhe: "CPF exposto em texto" },
  { rx: /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/, detalhe: "número de cartão exposto em texto" },
];

function detectAggressiveTone(msg: string): GuardianViolation | null {
  const letters = msg.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length >= 20) {
    const upper = letters.replace(/[^A-ZÀ-Ý]/g, "").length;
    if (upper / letters.length > 0.6) {
      return { tipo: "tom_agressivo", detalhe: "excesso de letras maiúsculas (>60%)" };
    }
  }
  if (/!{3,}/.test(msg) || /\?{3,}/.test(msg)) {
    return { tipo: "tom_agressivo", detalhe: "excesso de pontuação" };
  }
  if (/\b(agora\s+j[áa]|r[áa]pido|corre|n[ãa]o\s+perca\s+tempo)\b.*!{2,}/i.test(msg)) {
    return { tipo: "tom_agressivo", detalhe: "imperativo de pressão" };
  }
  return null;
}

/** Tenta gerar versão corrigida removendo trechos proibidos. Best-effort. */
function buildSuggestedFix(original: string, violations: GuardianViolation[]): string | undefined {
  let out = original;
  for (const v of violations) {
    if (v.trecho) {
      out = out.split(v.trecho).join("").replace(/\s{2,}/g, " ").trim();
    }
  }
  // Normaliza pontuação e caps
  out = out.replace(/!{2,}/g, "!").replace(/\?{2,}/g, "?");
  if (out.length > MAX_LEN) out = out.slice(0, MAX_LEN - 1).trimEnd() + "…";
  if (!out || out === original) return undefined;
  return out;
}

export function evaluateComplianceGuardian(message: string): GuardianResult {
  try {
    const msg = String(message ?? "").trim();
    const violations: GuardianViolation[] = [];

    if (!msg) {
      return { allowed: false, violations: [{ tipo: "excesso_tamanho", detalhe: "mensagem vazia" }] };
    }

    if (msg.length > MAX_LEN) {
      violations.push({
        tipo: "excesso_tamanho",
        detalhe: `mensagem com ${msg.length} caracteres (limite ${MAX_LEN})`,
      });
    }

    for (const p of FORBIDDEN_PATTERNS) {
      const m = msg.match(p.rx);
      if (m) violations.push({ tipo: p.tipo, detalhe: p.detalhe, trecho: m[0] });
    }

    for (const p of LGPD_PATTERNS) {
      const m = msg.match(p.rx);
      if (m) violations.push({ tipo: "risco_lgps_ans", detalhe: p.detalhe, trecho: m[0] });
    }

    const tone = detectAggressiveTone(msg);
    if (tone) violations.push(tone);

    if (violations.length === 0) return { allowed: true };

    return {
      allowed: false,
      violations,
      suggested_fix: buildSuggestedFix(msg, violations),
    };
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : String(e);
    return { allowed: false, violations: [{ tipo: "internal_error", detalhe }] };
  }
}

/** Loga violações em agent_compliance_log. Best-effort. */
export async function logComplianceViolation(
  supabase: any,
  ctx: {
    conversation_id?: string | null;
    user_id?: string | null;
    lead_id?: string | null;
    agent_slug?: string | null;
    stage: string;
    message_original: string;
    violations: GuardianViolation[];
    suggested_fix?: string | null;
    blocked: boolean;
  },
): Promise<void> {
  const tipoResumo = ctx.violations.map((v) => v.tipo).join(",") || "unknown";
  const detalheJson = JSON.stringify({
    stage: ctx.stage,
    agent_slug: ctx.agent_slug ?? null,
    user_id: ctx.user_id ?? null,
    lead_id: ctx.lead_id ?? null,
    violations: ctx.violations,
  });

  try {
    await supabase.from("agent_compliance_log").insert({
      conversation_id: ctx.conversation_id ?? null,
      violacao_tipo: `guardian:${tipoResumo}`,
      violacao_detalhe: detalheJson,
      mensagem_original: String(ctx.message_original ?? "").slice(0, 4000),
      mensagem_corrigida: ctx.suggested_fix ?? null,
      acao_tomada: ctx.blocked ? "bloqueada" : "enviada_com_aviso",
    });
  } catch (e) {
    console.warn(
      "[compliance-guardian] log insert failed:",
      e instanceof Error ? e.message : e,
    );
  }

  if (ctx.user_id && ctx.lead_id) {
    try {
      await supabase.from("action_log").insert({
        user_id: ctx.user_id,
        lead_id: ctx.lead_id,
        action_type: ctx.blocked ? "compliance_blocked" : "compliance_warning",
        metadata: {
          stage: ctx.stage,
          agent_slug: ctx.agent_slug ?? null,
          violations: ctx.violations,
          suggested_fix: ctx.suggested_fix ?? null,
        },
      });
    } catch (e) {
      console.warn(
        "[compliance-guardian] action_log insert failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }
}