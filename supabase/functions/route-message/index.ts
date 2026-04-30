// Routes inbound WhatsApp messages to the right agent. Today only the SDR
// pre-qualifier is wired up. Future expansions: follow-up, closer, negotiator.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SDR_STAGES = ["novo", "tentativa_contato", "contato_realizado"];

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

/**
 * Sends a pre-recorded voice note via UAZAPI when a trigger is active.
 * Triggers: apresentacao | entendimento | qualificacao_completa | follow_up_dia2 | follow_up_dia5
 */
async function sendAudioIfAvailable(
  supabase: any,
  trigger: string,
  phone: string,
  agentSlug: string = "sdr-qualificador",
): Promise<boolean> {
  const UAZAPI_URL = (Deno.env.get("UAZAPI_URL") ?? "").replace(/\/+$/, "");
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN") ?? "";
  if (!UAZAPI_URL || !UAZAPI_TOKEN) return false;

  const { data: audio } = await supabase
    .from("agent_audios")
    .select("audio_url, duracao_segundos")
    .eq("agent_slug", agentSlug)
    .eq("trigger", trigger)
    .eq("ativo", true)
    .maybeSingle();

  if (!audio?.audio_url) return false;

  // humanized "thinking/recording" delay
  const thinkDelay = 2000 + Math.random() * 2000;
  await new Promise((r) => setTimeout(r, thinkDelay));

  try {
    const resp = await fetch(`${UAZAPI_URL}/send/audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
      body: JSON.stringify({
        number: phone,
        audio: audio.audio_url,
        mimetype: "audio/ogg; codecs=opus",
        ptt: true,
      }),
    });
    console.log(`[audio] sent trigger=${trigger} to ${phone} status=${resp.status}`);
    return resp.ok;
  } catch (e) {
    console.warn(`[audio] failed trigger=${trigger}:`, e instanceof Error ? e.message : e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lead_id, whatsapp_number, message_text, is_audio } = await req.json();
    if (!lead_id || !whatsapp_number || !message_text) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "lead_id, whatsapp_number, message_text required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Skip if user took manual control of this lead
    const { data: lead } = await supabase
      .from("leads")
      .select("stage, in_manual_conversation, user_id, created_at, last_contact_at")
      .eq("id", lead_id)
      .maybeSingle();

    if (!lead) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "lead_not_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (lead.in_manual_conversation) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "manual_conversation" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Second gate: contact category blocks SDR even if upstream missed it.
    const { data: categoryContact } = await supabase
      .from("whatsapp_contacts")
      .select("category")
      .eq("user_id", lead.user_id)
      .eq("phone", whatsapp_number)
      .maybeSingle();
    const blockingCategories = ["personal", "team", "partner", "vendor", "spam"];
    if (categoryContact?.category && blockingCategories.includes(categoryContact.category)) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "contact_category_blocks", categoria: categoryContact.category }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stage = lead.stage ?? "novo";
    if (!SDR_STAGES.includes(stage)) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "stage_out_of_sdr_scope", stage }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Check if the SDR agent is enabled
    const { data: agentRow } = await supabase
      .from("agents_config")
      .select("ativo")
      .eq("slug", "sdr-qualificador")
      .maybeSingle();

    if (!agentRow?.ativo) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "agent_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Invoke the SDR
    const normalizedPhone = normalizePhone(whatsapp_number);
    const { data: sdrResp, error: sdrErr } = await supabase.functions.invoke(
      "sdr-qualificador",
      {
        body: {
          lead_id,
          whatsapp_number: normalizedPhone,
          user_message: message_text,
          is_audio: is_audio === true,
        },
      },
    );
    if (sdrErr) throw sdrErr;
    if (!sdrResp?.ok) throw new Error(sdrResp?.error ?? "SDR call failed");

    // 4. Log the routing decision
    await supabase.from("router_decisions").insert({
      conversation_id: sdrResp.conversation_id ?? null,
      message_in: message_text.slice(0, 500),
      contexto_avaliado: { stage, lead_id },
      agent_escolhido: "sdr-qualificador",
      motivo: `stage=${stage}`,
    });

    // 5. Send each balloon with a humanized delay via send-whatsapp
    const mensagens: string[] = sdrResp.mensagens ?? [];
    const delays: number[] = sdrResp.delays_ms ?? [];
    const metaObjAll: any = sdrResp.metadata ?? {};
    const coletadoAll = metaObjAll?.coletado ?? {};
    const camposColetados = Object.values(coletadoAll).filter(
      (v) => v !== null && v !== undefined && v !== "",
    ).length;
    const palavrasUltimaMsg = (message_text ?? "").trim().split(/\s+/).filter(Boolean).length;
    // Estimate turn number from existing conversation balloons
    const { data: convForTurn } = await supabase
      .from("agent_conversations")
      .select("balao_count")
      .eq("lead_id", lead_id)
      .eq("agent_slug", "sdr-qualificador")
      .order("ultima_atividade", { ascending: false })
      .limit(1)
      .maybeSingle();
    const turnNumber = Math.max(1, Math.floor((convForTurn?.balao_count ?? 0) / 2) + 1);
    let entendimentoSent = false;

    for (let i = 0; i < mensagens.length; i++) {
      const delay = Math.min(delays[i] ?? 3000, 15000);
      await new Promise((r) => setTimeout(r, delay));
      try {
        await supabase.functions.invoke("send-whatsapp", {
          body: {
            phone: normalizedPhone,
            message: mensagens[i],
            lead_id,
            user_id: lead.user_id,
          },
        });
      } catch (sendErr) {
        console.error(
          "send-whatsapp failed:",
          sendErr instanceof Error ? sendErr.message : sendErr,
        );
      }

      // After first balloon: presentation audio if lead is engaged (turn 2+, msg has 5+ words)
      if (i === 0 && turnNumber === 2 && palavrasUltimaMsg > 5) {
        await sendAudioIfAvailable(supabase, "apresentacao", normalizedPhone);
      }
      // After first balloon: understanding audio when 4+ fields collected (only once)
      if (i === 0 && !entendimentoSent && camposColetados >= 4 && !sdrResp.qualificou) {
        entendimentoSent = await sendAudioIfAvailable(supabase, "entendimento", normalizedPhone);
      }
    }

    // After all balloons: qualification-complete audio
    if (sdrResp.qualificou) {
      await sendAudioIfAvailable(supabase, "qualificacao_completa", normalizedPhone);
    }

    // 6. If qualified, advance stage + notify the user
    if (sdrResp.qualificou && lead.user_id) {
      await supabase
        .from("leads")
        .update({
          stage: "contato_realizado",
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead_id);

      // Monta resumo estruturado (Onda 3)
      const metaObj = sdrResp.metadata || {};
      const coletado = metaObj.coletado || {};
      const resumoLinhas = [
        coletado.tipo && `• ${coletado.tipo}${coletado.vidas ? ` • ${coletado.vidas} vidas` : ""}`,
        coletado.plano_atual?.operadora && `• Hoje: ${coletado.plano_atual.operadora}`,
        coletado.orcamento && `• Orçamento: ${coletado.orcamento}`,
        coletado.urgencia && `• Urgência: ${coletado.urgencia}`,
        coletado.regiao && `• Região: ${coletado.regiao}`,
      ].filter(Boolean).join("\n");

      const leadName = (await supabase.from("leads").select("name,phone").eq("id", lead_id).maybeSingle()).data;
      const displayName = leadName?.name || leadName?.phone || "lead";

      await supabase.from("notifications").insert({
        user_id: lead.user_id,
        type: "lead_qualificado",
        title: `🎯 SDR qualificou ${displayName}`,
        body: resumoLinhas || `O lead avançou para "contato_realizado". Assuma a conversa no WhatsApp.`,
        lead_id,
      });
    }

    // Auto-update lead memory after every successful SDR turn (background)
    if (lead?.user_id) {
      supabase.functions.invoke("update-lead-memory", {
        body: { leadId: lead_id, userId: lead.user_id },
      }).catch((e: any) =>
        console.warn("[route-message] update-lead-memory background failed:", e?.message),
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        agent: "sdr-qualificador",
        mensagens_enviadas: mensagens.length,
        qualificou: !!sdrResp.qualificou,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("route-message error:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});