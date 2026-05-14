// Junior — Follow-up pós-cotação
// Cadência enxuta e parametrizável após `last_quote_sent_at`.
// Padrão: 2h, 24h, 72h, 7d (4 toques no máximo).
// Gates aplicados em cada execução (fail-closed):
//   - cotação enviada (last_quote_sent_at não nulo)
//   - estágio compatível (cotacao_enviada / contato_realizado)
//   - sem in_manual_conversation
//   - sem opted_out (whatsapp_contacts.opted_out)
//   - sem inbound recente (últimas 6h)
//   - opt-out por palavra-chave nas últimas mensagens recebidas
//   - dentro da janela compliance (08-21 BRT, dias úteis) — gate de send-whatsapp confirma
// Cron sugerido: a cada 15 minutos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AGENT_SLUG = "junior-followup";
const DEFAULT_CADENCE_HOURS = [2, 24, 72, 168]; // 2h, 24h, 72h, 7d
const RECENT_INBOUND_WINDOW_MS = 6 * 60 * 60 * 1000;
const ELIGIBLE_STAGES = new Set(["cotacao_enviada", "contato_realizado"]);

const OPT_OUT_PATTERNS: RegExp[] = [
  /\bn[aã]o (me )?(mande|manda|envie|envia|chame|chama)\b/i,
  /\bpara de (mandar|enviar|me chamar|chamar)\b/i,
  /\bn[aã]o tenho interesse\b/i,
  /\bn[aã]o quero (mais )?(receber|conversar|nada)\b/i,
  /\bme remov(a|er) (da lista|do contato)\b/i,
  /\bcancela(r)?( o)? contato\b/i,
  /\bn[aã]o me incomod[ae]\b/i,
  /\bperdi (o )?interesse\b/i,
  /\bdesist[ií]\b/i,
];

function normalizePhone(phone: string): string {
  const d = (phone || "").replace(/\D/g, "");
  return d.startsWith("55") ? d : `55${d}`;
}

function detectOptOut(text: string): boolean {
  if (!text) return false;
  const norm = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return OPT_OUT_PATTERNS.some((re) => re.test(text) || re.test(norm));
}

/** Variações de abordagem por toque — curtas, contextualizadas, sem cobrança. */
function buildMessage(opts: {
  step_index: number;
  lead_name: string;
  operadora?: string | null;
  plano_nome?: string | null;
}): { message: string; approach: string } {
  const primeiroNome = (opts.lead_name || "tudo bem").split(/\s+/)[0];
  const op = opts.operadora ? ` da ${opts.operadora}` : "";
  const plano = opts.plano_nome ? ` (${opts.plano_nome})` : "";

  // Pequena rotação interna por step pra não soar mecânico
  const pools: Array<{ approach: string; messages: string[] }> = [
    {
      approach: "checagem_leve",
      messages: [
        `${primeiroNome}, deu pra dar uma olhada na cotação${op}${plano}? Qualquer dúvida me chama 🙂`,
        `Oi ${primeiroNome}! Conseguiu ver a proposta${op}? Posso esclarecer qualquer ponto.`,
      ],
    },
    {
      approach: "ajuda_concreta",
      messages: [
        `${primeiroNome}, posso te ajudar comparando algum ponto da cotação${op}? Rede, valor ou cobertura?`,
        `Se quiser, te explico em 2 minutos as diferenças do plano${op} pra ficar mais claro.`,
      ],
    },
    {
      approach: "valor_concreto",
      messages: [
        `${primeiroNome}, ainda faz sentido seguirmos com essa cotação${op}? Posso ajustar pra outro perfil se preferir.`,
        `Se algo mudou, me avisa que adapto a proposta${op} sem compromisso.`,
      ],
    },
    {
      approach: "encerrar_respeitoso",
      messages: [
        `${primeiroNome}, vou parar por aqui pra não te incomodar. Se precisar no futuro, é só me chamar 🙏`,
        `${primeiroNome}, deixo essa em standby. Quando quiser retomar é só responder por aqui.`,
      ],
    },
  ];

  const idx = Math.min(opts.step_index, pools.length - 1);
  const pool = pools[idx];
  const message = pool.messages[Math.floor(Math.random() * pool.messages.length)];
  return { message, approach: pool.approach };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Permite override da cadência via body (parametrizável)
  let cadence = DEFAULT_CADENCE_HOURS;
  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      if (Array.isArray(body?.cadence_hours) && body.cadence_hours.length > 0) {
        const arr = body.cadence_hours.filter((n: any) => Number.isFinite(n) && n > 0);
        if (arr.length) cadence = arr;
      }
    } catch { /* ignore */ }
  }

  const stats = { evaluated: 0, sent: 0, skipped: 0, failed: 0, scheduled: 0 };

  try {
    const nowMs = Date.now();
    const nowIso = new Date().toISOString();

    // 1) Encontra leads candidatos: cotação enviada, sem manual, sem soft-delete
    const { data: leads, error: lErr } = await supabase
      .from("leads")
      .select("id, user_id, name, phone, stage, last_quote_sent_at, in_manual_conversation, quote_operadora, quote_plan_name, deleted_at")
      .eq("in_manual_conversation", false)
      .is("deleted_at", null)
      .not("last_quote_sent_at", "is", null)
      .in("stage", Array.from(ELIGIBLE_STAGES))
      .limit(200);
    if (lErr) throw lErr;

    for (const lead of leads ?? []) {
      stats.evaluated++;
      const quoteAt = new Date(lead.last_quote_sent_at as string).getTime();
      const elapsedH = (nowMs - quoteAt) / 3_600_000;

      // 2) Acha próximo step não usado
      const { data: existing } = await supabase
        .from("junior_followup_attempts")
        .select("step_index, status")
        .eq("lead_id", lead.id)
        .order("step_index", { ascending: true });
      const usedSteps = new Set((existing ?? []).map((r) => r.step_index));
      const nextIdx = cadence.findIndex((_, i) => !usedSteps.has(i));
      if (nextIdx === -1) continue; // todos os toques já usados

      const offsetH = cadence[nextIdx];
      if (elapsedH < offsetH) continue; // janela mínima ainda não atingida

      const phone = normalizePhone(lead.phone);

      // 3) Gates secundários (registramos como skipped quando aplicável)
      const logSkip = async (reason: string) => {
        await supabase.from("junior_followup_attempts").insert({
          lead_id: lead.id,
          user_id: lead.user_id,
          step_index: nextIdx,
          cadence_offset_hours: offsetH,
          scheduled_at: nowIso,
          status: "skipped",
          skip_reason: reason,
        });
        stats.skipped++;
      };

      // 3a) opted_out
      const { data: contact } = await supabase
        .from("whatsapp_contacts")
        .select("opted_out, is_personal")
        .eq("phone", phone)
        .eq("user_id", lead.user_id)
        .maybeSingle();
      if (contact?.opted_out) { await logSkip("opted_out"); continue; }
      if (contact?.is_personal) { await logSkip("is_personal"); continue; }

      // 3b) inbound recente
      const since = new Date(nowMs - RECENT_INBOUND_WINDOW_MS).toISOString();
      const { data: recentInbound } = await supabase
        .from("whatsapp_messages")
        .select("id, content")
        .eq("phone", phone)
        .eq("direction", "inbound")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5);

      if ((recentInbound?.length ?? 0) > 0) {
        // 3c) opt-out por palavra-chave em qualquer inbound recente
        const optOutHit = recentInbound!.some((m: any) => detectOptOut(m.content || ""));
        if (optOutHit) {
          // Marca contato como opted_out pra parar todas as automações
          await supabase.from("whatsapp_contacts")
            .update({ opted_out: true, opted_out_at: nowIso })
            .eq("phone", phone)
            .eq("user_id", lead.user_id);
          await logSkip("opt_out_keyword_detected");
          continue;
        }
        await logSkip("recent_inbound");
        continue;
      }

      // 4) Monta mensagem variada e envia via send-whatsapp (gate fail-closed)
      const { message, approach } = buildMessage({
        step_index: nextIdx,
        lead_name: lead.name || "",
        operadora: lead.quote_operadora,
        plano_nome: lead.quote_plan_name,
      });

      try {
        const { data: sendRes, error: sendErr } = await supabase.functions.invoke("send-whatsapp", {
          body: {
            phone,
            message,
            user_id: lead.user_id,
            lead_id: lead.id,
            agent_slug: AGENT_SLUG, // força revalidação no gate
          },
        });

        if (sendErr || (sendRes && sendRes.ok === false)) {
          const reason = sendRes?.gate_block?.reason || sendRes?.error || sendErr?.message || "send_failed";
          await supabase.from("junior_followup_attempts").insert({
            lead_id: lead.id,
            user_id: lead.user_id,
            step_index: nextIdx,
            cadence_offset_hours: offsetH,
            scheduled_at: nowIso,
            status: sendRes?.gate_block ? "skipped" : "failed",
            skip_reason: String(reason).slice(0, 200),
            message_content: message,
            approach_tag: approach,
          });
          if (sendRes?.gate_block) stats.skipped++; else stats.failed++;
          continue;
        }

        await supabase.from("junior_followup_attempts").insert({
          lead_id: lead.id,
          user_id: lead.user_id,
          step_index: nextIdx,
          cadence_offset_hours: offsetH,
          scheduled_at: nowIso,
          sent_at: nowIso,
          status: "sent",
          message_content: message,
          approach_tag: approach,
        });

        // Atualiza last_contact_at e registra interaction
        await supabase.from("leads").update({
          last_contact_at: nowIso,
          updated_at: nowIso,
        }).eq("id", lead.id);

        await supabase.from("interactions").insert({
          lead_id: lead.id,
          user_id: lead.user_id,
          type: "whatsapp",
          description: `[Junior follow-up #${nextIdx + 1} • ${approach}] ${message.slice(0, 140)}`,
        });

        stats.sent++;
        await new Promise((r) => setTimeout(r, 800)); // rate-limit suave
      } catch (sendCatch) {
        const msg = sendCatch instanceof Error ? sendCatch.message : String(sendCatch);
        await supabase.from("junior_followup_attempts").insert({
          lead_id: lead.id,
          user_id: lead.user_id,
          step_index: nextIdx,
          cadence_offset_hours: offsetH,
          scheduled_at: nowIso,
          status: "failed",
          skip_reason: msg.slice(0, 200),
          message_content: message,
          approach_tag: approach,
        });
        stats.failed++;
      }
    }

    return new Response(JSON.stringify({ ok: true, stats, cadence_hours: cadence }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[junior-followup] fatal:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg, stats }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});