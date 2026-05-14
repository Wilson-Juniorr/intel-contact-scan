// Detector centralizado de opt-out para mensagens recebidas no WhatsApp.
// Padrões cobrem palavras-chave universais (STOP/PARAR/SAIR) e frases
// naturais em português ("não quero mais", "para de mandar", etc.).
//
// Quando detectado:
//   - Persistir whatsapp_contacts.opted_out = true (+ opted_out_at)
//   - Pausar automações (lead.in_manual_conversation = true)
//   - Registrar em agent_compliance_log + action_log

export const OPT_OUT_PATTERNS: RegExp[] = [
  // Universais (case-insensitive, palavra inteira)
  /\bstop\b/i,
  /\bparar\b/i,
  /\bsair\b/i,
  /\bunsubscribe\b/i,
  /\bcancelar?\s+(contato|inscri[cç][aã]o|envios?)\b/i,

  // Frases naturais
  /\bn[aã]o\s+(me\s+)?(quero|desejo)\b/i,
  /\bn[aã]o\s+(me\s+)?(mande|manda|envie|envia|chame|chama|escreva)\b/i,
  /\bpara\s+de\s+(mandar|enviar|me\s+chamar|chamar|me\s+escrever)\b/i,
  /\bn[aã]o\s+tenho\s+interesse\b/i,
  /\bn[aã]o\s+quero\s+(mais\s+)?(receber|conversar|nada)\b/i,
  /\bme\s+remov(a|er)\s+(da\s+lista|do\s+contato)\b/i,
  /\bn[aã]o\s+me\s+incomod[ae]\b/i,
  /\bperdi\s+(o\s+)?interesse\b/i,
  /\bdesist[ií]\b/i,
];

const OPT_IN_PATTERNS: RegExp[] = [
  /\bquero\s+(receber|voltar|continuar)\b/i,
  /\bopt[-\s]?in\b/i,
  /\bme\s+(adiciona|inclui)\s+de\s+novo\b/i,
];

function normalize(text: string): string {
  return (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function detectOptOut(text: string): { match: boolean; pattern?: string } {
  if (!text) return { match: false };
  const raw = String(text);
  const norm = normalize(raw);
  for (const re of OPT_OUT_PATTERNS) {
    if (re.test(raw) || re.test(norm)) {
      return { match: true, pattern: re.source };
    }
  }
  return { match: false };
}

export function detectOptIn(text: string): boolean {
  if (!text) return false;
  const raw = String(text);
  const norm = normalize(raw);
  return OPT_IN_PATTERNS.some((re) => re.test(raw) || re.test(norm));
}

/** Persiste opt-out e registra evidência em compliance + action_log. */
export async function applyOptOut(
  supabase: any,
  ctx: {
    user_id: string;
    phone: string;            // normalizado com 55
    lead_id?: string | null;
    message_original: string;
    detected_pattern?: string;
    source?: "inbound_webhook" | "manual_corretor" | "scheduler";
  },
): Promise<void> {
  const nowIso = new Date().toISOString();

  // 1) Marca contato como opted_out (idempotente)
  try {
    await supabase
      .from("whatsapp_contacts")
      .update({ opted_out: true, opted_out_at: nowIso })
      .eq("user_id", ctx.user_id)
      .eq("phone", ctx.phone);
  } catch (e) {
    console.warn("[opt-out] update contact failed:", e instanceof Error ? e.message : e);
  }

  // 2) Pausa automação no lead, se houver
  if (ctx.lead_id) {
    try {
      await supabase
        .from("leads")
        .update({ in_manual_conversation: true })
        .eq("id", ctx.lead_id);
    } catch (e) {
      console.warn("[opt-out] pause lead failed:", e instanceof Error ? e.message : e);
    }
  }

  // 3) Compliance log
  try {
    await supabase.from("agent_compliance_log").insert({
      conversation_id: null,
      violacao_tipo: "opt_out_received",
      violacao_detalhe: JSON.stringify({
        user_id: ctx.user_id,
        lead_id: ctx.lead_id ?? null,
        phone: ctx.phone,
        pattern: ctx.detected_pattern ?? null,
        source: ctx.source ?? "inbound_webhook",
        at: nowIso,
      }),
      mensagem_original: String(ctx.message_original ?? "").slice(0, 4000),
      mensagem_corrigida: null,
      acao_tomada: "automacao_pausada_opt_out",
    });
  } catch (e) {
    console.warn("[opt-out] compliance log failed:", e instanceof Error ? e.message : e);
  }

  // 4) Action log (auditoria por lead)
  if (ctx.lead_id) {
    try {
      await supabase.from("action_log").insert({
        user_id: ctx.user_id,
        lead_id: ctx.lead_id,
        action_type: "opt_out_received",
        metadata: {
          phone: ctx.phone,
          pattern: ctx.detected_pattern ?? null,
          source: ctx.source ?? "inbound_webhook",
        },
      });
    } catch (e) {
      console.warn("[opt-out] action_log failed:", e instanceof Error ? e.message : e);
    }
  }
}
