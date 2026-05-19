// Gate único de segurança para qualquer mensagem automática (IA) que vai para
// o WhatsApp. Deve ser chamado tanto no roteamento (route-message) quanto na
// hora final do envio (send-whatsapp), em estilo fail-closed: se algum check
// falhar/erro, bloqueia.
//
// Bloqueia quando:
//   - contato é categoria pessoal/equipe/parceiro/fornecedor/spam
//   - lead está em modo manual (`leads.in_manual_conversation = true`)
//   - contato pediu opt-out (`whatsapp_contacts.opted_out = true`)
//   - estamos fora da janela de compliance configurada para o usuário

export type GateBlock = {
  allowed: false;
  reason:
    | "contact_category_blocks"
    | "personal_contact"
    | "manual_conversation"
    | "opted_out"
    | "rate_limited"
    | "outside_compliance_window"
    | "lead_not_found"
    | "user_unresolved"
    | "internal_error";
  detail?: string;
  metadata?: Record<string, unknown>;
};

export type GateAllow = { allowed: true };
export type GateResult = GateAllow | GateBlock;

const BLOCKING_CATEGORIES = ["personal", "team", "partner", "vendor", "spam"];
const RATE_LIMIT_EXEMPT_AGENTS = new Set(["junior-sdr", "sdr-qualificador"]);

// Anti-spam: limites de envio AUTOMÁTICO por janela de tempo (por telefone+user).
// Manual (corretor) NÃO passa por este gate.
const RATE_LIMIT_RULES: { window_minutes: number; max_messages: number }[] = [
  { window_minutes: 30, max_messages: 1 },     // no máx 1 mensagem automática a cada 30 min
  { window_minutes: 60 * 24, max_messages: 4 },// no máx 4 mensagens automáticas em 24h
  { window_minutes: 60 * 24 * 7, max_messages: 8 }, // no máx 8 por semana
];

export interface GateInput {
  user_id: string | null;
  phone: string;            // já normalizado (com 55)
  lead_id?: string | null;
  agent_slug?: string | null;
  /** Quando true (envio manual humano), o gate é desligado e libera. */
  manual_override?: boolean;
  /** Quando true, ignora o check de janela de compliance (ex: agendou depois). */
  skip_window_check?: boolean;
}

export async function evaluateAutomationGate(
  supabase: any,
  input: GateInput,
): Promise<GateResult> {
  if (input.manual_override) return { allowed: true };

  if (!input.user_id) {
    return { allowed: false, reason: "user_unresolved" };
  }

  try {
    // 1. Lead em modo manual?
    if (input.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("in_manual_conversation")
        .eq("id", input.lead_id)
        .maybeSingle();
      if (lead?.in_manual_conversation === true) {
        return { allowed: false, reason: "manual_conversation" };
      }
    }

    // 2/3. Contato — categoria bloqueante, opt-out e/ou pessoal
    const { data: contact } = await supabase
      .from("whatsapp_contacts")
      .select("category, opted_out, is_personal")
      .eq("user_id", input.user_id)
      .eq("phone", input.phone)
      .maybeSingle();

    if (contact?.opted_out === true) {
      return { allowed: false, reason: "opted_out" };
    }
    if (contact?.is_personal === true) {
      return { allowed: false, reason: "personal_contact" };
    }
    if (contact?.category && BLOCKING_CATEGORIES.includes(contact.category)) {
      return {
        allowed: false,
        reason: "contact_category_blocks",
        metadata: { category: contact.category },
      };
    }

    // 3.5. Anti-spam: limites de frequência por janela.
    // O SDR é reativo a inbound e pode enviar 2 balões no mesmo turno; limitar por
    // mensagem quebrava o fluxo de pré-qualificação e bloqueava respostas como "sim".
    if (!input.agent_slug || !RATE_LIMIT_EXEMPT_AGENTS.has(input.agent_slug)) {
      const now = Date.now();
      for (const rule of RATE_LIMIT_RULES) {
        const since = new Date(now - rule.window_minutes * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", input.user_id)
          .eq("phone", input.phone)
          .eq("direction", "outbound")
          .gte("created_at", since);
        if ((count ?? 0) >= rule.max_messages) {
          return {
            allowed: false,
            reason: "rate_limited",
            metadata: {
              window_minutes: rule.window_minutes,
              max_messages: rule.max_messages,
              actual_count: count ?? 0,
            },
          };
        }
      }
    }

    // 4. Janela de compliance (quando aplicável)
    if (!input.skip_window_check) {
      const { data: settings } = await supabase
        .from("compliance_settings")
        .select("window_start, window_end, timezone, weekdays_only, ativo")
        .eq("user_id", input.user_id)
        .maybeSingle();

      if (settings?.ativo) {
        const now = new Date();
        const fmt = new Intl.DateTimeFormat("pt-BR", {
          timeZone: settings.timezone || "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
          weekday: "short",
          hour12: false,
        }).formatToParts(now);
        const hour = parseInt(fmt.find((p) => p.type === "hour")!.value, 10);
        const minute = parseInt(fmt.find((p) => p.type === "minute")!.value, 10);
        const weekday = fmt.find((p) => p.type === "weekday")!.value.toLowerCase();
        const isWeekend =
          weekday.startsWith("sáb") || weekday.startsWith("sab") || weekday.startsWith("dom");

        const cur = hour * 60 + minute;
        const [sh, sm] = String(settings.window_start).split(":").map(Number);
        const [eh, em] = String(settings.window_end).split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;

        const outside = cur < startMin || cur >= endMin;
        const weekendBlocked = settings.weekdays_only && isWeekend;
        if (outside || weekendBlocked) {
          return {
            allowed: false,
            reason: "outside_compliance_window",
            metadata: {
              outside_hours: outside,
              weekend_blocked: weekendBlocked,
              window: `${settings.window_start}-${settings.window_end}`,
            },
          };
        }
      }
    }

    return { allowed: true };
  } catch (e) {
    // fail-closed
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[automation-gate] internal error:", msg);
    return { allowed: false, reason: "internal_error", detail: msg };
  }
}

/** Loga um bloqueio em `action_log` e em `agent_compliance_log`. Best-effort. */
export async function logAutomationBlock(
  supabase: any,
  block: GateBlock,
  ctx: {
    user_id: string | null;
    lead_id?: string | null;
    agent_slug?: string | null;
    conversation_id?: string | null;
    stage: "inbound_routing" | "send_whatsapp";
    phone: string;
    message_preview?: string;
  },
): Promise<void> {
  const meta = {
    reason: block.reason,
    detail: block.detail ?? null,
    metadata: block.metadata ?? null,
    stage: ctx.stage,
    phone: ctx.phone,
    agent_slug: ctx.agent_slug ?? null,
  };

  // action_log exige user_id + lead_id NOT NULL — só grava se tiver os dois.
  if (ctx.user_id && ctx.lead_id) {
    try {
      await supabase.from("action_log").insert({
        user_id: ctx.user_id,
        lead_id: ctx.lead_id,
        action_type: "automation_blocked",
        metadata: meta,
      });
    } catch (e) {
      console.warn("[automation-gate] action_log insert failed:", e instanceof Error ? e.message : e);
    }
  }

  try {
    await supabase.from("agent_compliance_log").insert({
      conversation_id: ctx.conversation_id ?? null,
      violacao_tipo: `gate_block:${block.reason}`,
      violacao_detalhe: JSON.stringify(meta),
      mensagem_original: ctx.message_preview ?? "",
      mensagem_corrigida: null,
      acao_tomada: "blocked_before_send",
    });
  } catch (e) {
    console.warn(
      "[automation-gate] agent_compliance_log insert failed:",
      e instanceof Error ? e.message : e,
    );
  }
}