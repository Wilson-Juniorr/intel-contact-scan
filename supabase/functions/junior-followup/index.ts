// Junior — Follow-up inteligente em 2 fases
// FASE 1 (0-72h): Junior faz follow-up pessoal, mais intenso (5 toques em 3 dias)
// FASE 2 (após 72h): Cadência espaçada, tom mais institucional
//
// Gates aplicados em cada execução (fail-closed):
//   - last_quote_sent_at não nulo OU conversa SDR pausada por timeout
//   - estágio compatível (cotacao_enviada / contato_realizado)
//   - sem in_manual_conversation
//   - sem opted_out (whatsapp_contacts.opted_out)
//   - sem inbound recente (4h na fase 1, 6h na fase 2)
//   - opt-out por palavra-chave nas últimas mensagens recebidas
//   - dentro da janela compliance — gate de send-whatsapp confirma
// Cron sugerido: a cada 15 minutos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AGENT_SLUG = "junior-followup";

// FASE 1: Junior pessoal (primeiros 3 dias) — cadência mais intensa
const PHASE1_CADENCE_HOURS = [2, 6, 24, 48, 72];
const PHASE1_INBOUND_WINDOW_MS = 4 * 60 * 60 * 1000;

// FASE 2: Follow-up institucional (após 3 dias) — espaçado
const PHASE2_CADENCE_HOURS = [120, 168, 336]; // 5d, 7d, 14d
const PHASE2_INBOUND_WINDOW_MS = 6 * 60 * 60 * 1000;

// Cadência combinada (fase 1 + fase 2)
const FULL_CADENCE_HOURS = [...PHASE1_CADENCE_HOURS, ...PHASE2_CADENCE_HOURS];
const PHASE1_COUNT = PHASE1_CADENCE_HOURS.length;

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
  const norm = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return OPT_OUT_PATTERNS.some((re) => re.test(text) || re.test(norm));
}

/**
 * FASE 1: Mensagens do Junior (pessoal, como se fosse ele retomando)
 * Tom: natural, curto, sem pressão mas com direção
 */
function buildPhase1Message(opts: {
  step_index: number;
  lead_name: string;
  objetivo?: string | null;
  tem_dados: boolean;
}): { message: string; approach: string } {
  const nome = (opts.lead_name || "").split(/\s+/)[0] || "tudo bem";
  const objetivo = (opts.objetivo || "").toLowerCase();

  const pools: Array<{ approach: string; messages: string[] }> = [
    {
      approach: "retomada_rapida",
      messages: [
        `${nome}, vi que a gente tava conversando aqui. Fica tranquilo, sem pressa — quando puder me responder a gente continua 🙂`,
        `Oi ${nome}! Sei que o dia é corrido. Quando tiver um minutinho pra gente fechar os dados do plano, me chama aqui.`,
        `${nome}, tô por aqui quando puder continuar. Falta pouco pra eu montar as opções certas pra você.`,
      ],
    },
    {
      approach: "valor_rapido",
      messages: [
        `${nome}, só pra você saber: assim que a gente fechar os dados eu já consigo te mandar as melhores opções em menos de 1h. Me chama quando puder 👍`,
        `Oi ${nome}! Tô separando umas opções boas aqui. Só preciso confirmar uns dados contigo pra não te mandar coisa que não faz sentido.`,
        opts.tem_dados
          ? `${nome}, com o que você já me passou eu já tenho uma boa base. Falta só mais um ou dois dados pra eu fechar a cotação certinha.`
          : `${nome}, me conta quando puder: é plano pra você ou pra empresa? Com isso eu já começo a filtrar as melhores opções.`,
      ],
    },
    {
      approach: "dia_seguinte",
      messages: [
        `Bom dia ${nome}! Passando aqui rapidinho — ainda faz sentido a gente ver as opções de plano? Tô com tudo pronto pra montar sua cotação.`,
        `${nome}, bom dia! Ontem a gente tava vendo sobre plano de saúde. Quando puder me responder eu finalizo a cotação pra você.`,
        `Oi ${nome}! Novo dia, novas energias 😄 Me avisa quando quiser continuar sobre o plano que eu tô por aqui.`,
      ],
    },
    {
      approach: "urgencia_suave",
      messages: [
        `${nome}, só um toque: as tabelas que eu tenho aqui são válidas até o fim do mês. Se quiser garantir esse valor, me chama que a gente fecha rápido.`,
        `Oi ${nome}! Tô com umas condições boas aqui que valem por pouco tempo. Quer que eu te mande um resumo rápido das opções?`,
        objetivo.includes("troca") || objetivo.includes("reduz")
          ? `${nome}, vi que você tá querendo melhorar o plano. Tenho opções que podem te economizar bastante — me chama que te mostro em 2 min.`
          : `${nome}, posso te mandar um comparativo rápido das 2-3 melhores opções pro seu perfil? Sem compromisso, só pra você ter uma base.`,
      ],
    },
    {
      approach: "ultima_pessoal",
      messages: [
        `${nome}, última mensagem minha por aqui pra não te incomodar. Se em algum momento quiser retomar, é só me chamar que eu retomo de onde paramos 🙏`,
        `${nome}, vou dar uma pausa aqui. Seus dados ficam salvos comigo — quando quiser voltar a conversar sobre o plano, é só mandar um oi.`,
        `Oi ${nome}, entendo que talvez não seja o momento. Vou ficar por aqui caso mude de ideia. Qualquer dúvida futura, pode me chamar sem cerimônia.`,
      ],
    },
  ];

  const idx = Math.min(opts.step_index, pools.length - 1);
  const pool = pools[idx];
  const message = pool.messages[Math.floor(Math.random() * pool.messages.length)];
  return { message, approach: pool.approach };
}

/**
 * FASE 2: Follow-up institucional (após 3 dias)
 * Tom: profissional, oferece valor concreto, sem pressão
 */
function buildPhase2Message(opts: {
  step_index: number;
  lead_name: string;
  operadora?: string | null;
}): { message: string; approach: string } {
  const nome = (opts.lead_name || "").split(/\s+/)[0] || "tudo bem";
  const op = opts.operadora ? ` da ${opts.operadora}` : "";

  const pools: Array<{ approach: string; messages: string[] }> = [
    {
      approach: "novidade",
      messages: [
        `${nome}, saiu uma condição nova essa semana em algumas operadoras${op}. Se ainda tiver interesse, posso te mostrar o que mudou.`,
        `Oi ${nome}! Tô com umas tabelas atualizadas aqui. Quer que eu dê uma olhada se tem algo melhor pro seu perfil?`,
      ],
    },
    {
      approach: "checagem_final",
      messages: [
        `${nome}, faz uma semana que a gente conversou. Ainda posso te ajudar com o plano de saúde? Se não for mais o momento, sem problema nenhum.`,
        `Oi ${nome}! Passando aqui uma última vez sobre o plano. Se precisar no futuro, pode me chamar direto por aqui.`,
      ],
    },
    {
      approach: "encerramento_definitivo",
      messages: [
        `${nome}, vou encerrar nosso contato por aqui pra não te incomodar. Seus dados ficam salvos — quando precisar, é só mandar um oi que eu retomo. Valeu! 🙏`,
        `${nome}, última mensagem minha. Se um dia precisar de plano de saúde, pode me chamar aqui que eu te atendo na hora. Abraço!`,
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

  const stats = { evaluated: 0, sent: 0, skipped: 0, failed: 0, sdr_timed_out: 0 };

  try {
    const nowMs = Date.now();
    const nowIso = new Date().toISOString();

    // ═══ FASE 0: Pausar conversas SDR inativas (timeout 2h) ═══
    const SDR_INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000;
    const timeoutThreshold = new Date(nowMs - SDR_INACTIVITY_TIMEOUT_MS).toISOString();

    const { data: staleConvs } = await supabase
      .from("agent_conversations")
      .select("id, lead_id, ultima_atividade")
      .eq("agent_slug", "junior-sdr")
      .in("status", ["ativa", "digitando"])
      .lt("ultima_atividade", timeoutThreshold)
      .limit(50);

    for (const conv of staleConvs ?? []) {
      await supabase.from("agent_conversations")
        .update({ status: "pausada", ultima_atividade: nowIso })
        .eq("id", conv.id);

      const { data: staleLead } = await supabase
        .from("leads")
        .select("user_id, name, phone, stage")
        .eq("id", conv.lead_id)
        .maybeSingle();

      if (staleLead?.user_id) {
        const displayName = staleLead.name || staleLead.phone || "lead";
        await supabase.from("notifications").insert({
          user_id: staleLead.user_id,
          type: "sdr_timeout",
          title: `Junior pausou — ${displayName} não respondeu`,
          body: `Lead não respondeu há 2h+ durante qualificação. Follow-up vai assumir.\n\nSe quiser retomar, é só responder direto.`,
          lead_id: conv.lead_id,
        });

        await supabase.from("action_log").insert({
          user_id: staleLead.user_id,
          lead_id: conv.lead_id,
          action_type: "sdr_timeout_inactivity",
          metadata: { conversation_id: conv.id, ultima_atividade: conv.ultima_atividade },
        });

        // Garante que o lead está elegível pro follow-up
        const needsStageUpdate = !staleLead.stage ||
          !["cotacao_enviada", "contato_realizado"].includes(staleLead.stage);
        await supabase.from("leads").update({
          ...(needsStageUpdate ? { stage: "contato_realizado" } : {}),
          last_quote_sent_at: nowIso,
          updated_at: nowIso,
        }).eq("id", conv.lead_id);
      }

      stats.sdr_timed_out++;
    }

    // ═══ FOLLOW-UP: Fase 1 (Junior pessoal) + Fase 2 (institucional) ═══
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

      // Acha próximo step não usado
      const { data: existing } = await supabase
        .from("junior_followup_attempts")
        .select("step_index, status")
        .eq("lead_id", lead.id)
        .order("step_index", { ascending: true });
      const usedSteps = new Set((existing ?? []).map((r: any) => r.step_index));
      const nextIdx = FULL_CADENCE_HOURS.findIndex((_, i) => !usedSteps.has(i));
      if (nextIdx === -1) continue;

      const offsetH = FULL_CADENCE_HOURS[nextIdx];
      if (elapsedH < offsetH) continue;

      const phone = normalizePhone(lead.phone);
      const isPhase1 = nextIdx < PHASE1_COUNT;
      const inboundWindow = isPhase1 ? PHASE1_INBOUND_WINDOW_MS : PHASE2_INBOUND_WINDOW_MS;

      // Gates
      const logSkip = async (reason: string) => {
        await supabase.from("junior_followup_attempts").insert({
          lead_id: lead.id, user_id: lead.user_id, step_index: nextIdx,
          cadence_offset_hours: offsetH, scheduled_at: nowIso,
          status: "skipped", skip_reason: reason,
        });
        stats.skipped++;
      };

      const { data: contact } = await supabase
        .from("whatsapp_contacts")
        .select("opted_out, is_personal")
        .eq("phone", phone).eq("user_id", lead.user_id)
        .maybeSingle();
      if (contact?.opted_out) { await logSkip("opted_out"); continue; }
      if (contact?.is_personal) { await logSkip("is_personal"); continue; }

      const since = new Date(nowMs - inboundWindow).toISOString();
      const { data: recentInbound } = await supabase
        .from("whatsapp_messages")
        .select("id, content")
        .eq("phone", phone).eq("direction", "inbound")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5);

      if ((recentInbound?.length ?? 0) > 0) {
        const optOutHit = recentInbound!.some((m: any) => detectOptOut(m.content || ""));
        if (optOutHit) {
          await supabase.from("whatsapp_contacts")
            .update({ opted_out: true, opted_out_at: nowIso })
            .eq("phone", phone).eq("user_id", lead.user_id);
          await logSkip("opt_out_keyword_detected");
          continue;
        }
        await logSkip("recent_inbound");
        continue;
      }

      // Monta mensagem baseada na fase
      let message: string;
      let approach: string;

      if (isPhase1) {
        // Busca dados coletados da conversa SDR pra contextualizar
        const { data: convData } = await supabase
          .from("agent_conversations")
          .select("conversation_state")
          .eq("lead_id", lead.id).eq("agent_slug", "junior-sdr")
          .order("ultima_atividade", { ascending: false })
          .limit(1).maybeSingle();
        const coletado = (convData?.conversation_state as any)?.coletado ?? {};
        const objetivo = coletado.objetivo || coletado.o_que_busca || null;
        const temDados = Object.keys(coletado).length > 2;

        const result = buildPhase1Message({
          step_index: nextIdx,
          lead_name: lead.name || "",
          objetivo,
          tem_dados: temDados,
        });
        message = result.message;
        approach = `fase1_${result.approach}`;
      } else {
        const result = buildPhase2Message({
          step_index: nextIdx - PHASE1_COUNT,
          lead_name: lead.name || "",
          operadora: lead.quote_operadora,
        });
        message = result.message;
        approach = `fase2_${result.approach}`;
      }

      // Envia
      try {
        const { data: sendRes, error: sendErr } = await supabase.functions.invoke("send-whatsapp", {
          body: { phone, message, user_id: lead.user_id, lead_id: lead.id, agent_slug: AGENT_SLUG },
        });

        if (sendErr || (sendRes && sendRes.ok === false)) {
          const reason = sendRes?.gate_block?.reason || sendRes?.error || sendErr?.message || "send_failed";
          await supabase.from("junior_followup_attempts").insert({
            lead_id: lead.id, user_id: lead.user_id, step_index: nextIdx,
            cadence_offset_hours: offsetH, scheduled_at: nowIso,
            status: sendRes?.gate_block ? "skipped" : "failed",
            skip_reason: String(reason).slice(0, 200),
            message_content: message, approach_tag: approach,
          });
          if (sendRes?.gate_block) stats.skipped++; else stats.failed++;
          continue;
        }

        await supabase.from("junior_followup_attempts").insert({
          lead_id: lead.id, user_id: lead.user_id, step_index: nextIdx,
          cadence_offset_hours: offsetH, scheduled_at: nowIso, sent_at: nowIso,
          status: "sent", message_content: message, approach_tag: approach,
        });

        await supabase.from("leads").update({
          last_contact_at: nowIso, updated_at: nowIso,
        }).eq("id", lead.id);

        await supabase.from("interactions").insert({
          lead_id: lead.id, user_id: lead.user_id, type: "whatsapp",
          description: `[Junior follow-up #${nextIdx + 1} • ${approach}] ${message.slice(0, 140)}`,
        });

        stats.sent++;
        await new Promise((r) => setTimeout(r, 800));
      } catch (sendCatch) {
        const msg = sendCatch instanceof Error ? sendCatch.message : String(sendCatch);
        await supabase.from("junior_followup_attempts").insert({
          lead_id: lead.id, user_id: lead.user_id, step_index: nextIdx,
          cadence_offset_hours: offsetH, scheduled_at: nowIso,
          status: "failed", skip_reason: msg.slice(0, 200),
          message_content: message, approach_tag: approach,
        });
        stats.failed++;
      }
    }

    return new Response(JSON.stringify({ ok: true, stats, cadence_hours: FULL_CADENCE_HOURS }), {
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
