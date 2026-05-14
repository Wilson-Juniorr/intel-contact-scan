// Routes inbound WhatsApp messages to the right agent. Today only the SDR
// pre-qualifier is wired up. Future expansions: follow-up, closer, negotiator.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  evaluateAutomationGate,
  logAutomationBlock,
} from "../_shared/automation-gate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SDR_STAGES = ["novo", "tentativa_contato", "contato_realizado"];

// Slug canônico do agente principal e nome da edge function correspondente.
// A função antiga `sdr-qualificador` permanece deployada como shim de
// compatibilidade para callers legados.
const SDR_AGENT_SLUG = "junior-sdr";

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
  agentSlug: string = SDR_AGENT_SLUG,
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
    const {
      lead_id,
      whatsapp_number,
      message_text,
      is_audio,
      source_type,
      transcription_confidence,
    } = await req.json();
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

    // ═══ AUDIO INTEGRITY GATE ═══
    // Áudio NÃO é mais shortcut de lead. Só avança se a transcrição entregou
    // texto inteligível com sinal de intenção real. Caso contrário, devolvemos
    // uma confirmação curta ao cliente — sem invocar o SDR e sem mover estágio.
    const normalizedPhoneAudioGate = normalizePhone(whatsapp_number);
    const audioIn = is_audio === true || source_type === "audio";
    const trimmedText = String(message_text ?? "").trim();
    const isUnintelligiblePlaceholder = /^\[?áudio n[aã]o compreendido\]?$/i.test(trimmedText)
      || /^\[?audio nao compreendido\]?$/i.test(trimmedText);
    const wordCount = trimmedText ? trimmedText.split(/\s+/).filter(Boolean).length : 0;
    const lowConfidence =
      typeof transcription_confidence === "number" && transcription_confidence < 0.5;

    let audioFallbackReason: string | null = null;
    if (audioIn) {
      if (!trimmedText || isUnintelligiblePlaceholder) {
        audioFallbackReason = "audio_unintelligible";
      } else if (lowConfidence) {
        audioFallbackReason = "audio_low_confidence";
      } else if (wordCount < 2) {
        audioFallbackReason = "audio_too_short";
      }
    }

    // Carrega lead cedo para usar user_id no fallback.
    const { data: leadEarly } = await supabase
      .from("leads")
      .select("stage, in_manual_conversation, user_id, created_at, last_contact_at")
      .eq("id", lead_id)
      .maybeSingle();

    if (!leadEarly) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "lead_not_found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (audioFallbackReason) {
      console.log(
        `[route-message] audio_received reason=${audioFallbackReason}` +
        ` confidence=${transcription_confidence ?? "null"} words=${wordCount}` +
        ` text_preview="${trimmedText.slice(0, 80)}"`,
      );

      // Mensagem curta de confirmação — não avança estágio, não invoca SDR.
      const fallbackMsg =
        "Oi! Recebi seu áudio, mas não consegui entender com clareza 🙏 " +
        "Pode me mandar por texto rapidinho? Assim consigo te ajudar direito.";
      try {
        await supabase.functions.invoke("send-whatsapp", {
          body: {
            phone: normalizedPhoneAudioGate,
            message: fallbackMsg,
            lead_id,
            user_id: leadEarly.user_id,
            agent_slug: SDR_AGENT_SLUG,
          },
        });
      } catch (sendErr) {
        console.error(
          "[route-message] audio fallback send failed:",
          sendErr instanceof Error ? sendErr.message : sendErr,
        );
      }

      try {
        await supabase.from("action_log").insert({
          user_id: leadEarly.user_id,
          lead_id,
          action_type: "audio_routing_fallback",
          metadata: {
            reason: audioFallbackReason,
            transcription_confidence: transcription_confidence ?? null,
            word_count: wordCount,
            transcription_preview: trimmedText.slice(0, 200),
            phone: normalizedPhoneAudioGate,
            decision: "no_sdr_invoke_no_stage_change",
          },
        });
      } catch (logErr) {
        console.error(
          "[route-message] action_log insert failed:",
          logErr instanceof Error ? logErr.message : logErr,
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          skipped: "audio_fallback",
          reason: audioFallbackReason,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (audioIn) {
      // Áudio aprovado para roteamento — registra decisão para auditoria.
      console.log(
        `[route-message] audio_received reason=ok confidence=${transcription_confidence ?? "null"}` +
        ` words=${wordCount} text_preview="${trimmedText.slice(0, 80)}"`,
      );
      try {
        await supabase.from("action_log").insert({
          user_id: leadEarly.user_id,
          lead_id,
          action_type: "audio_routed_to_sdr",
          metadata: {
            transcription_confidence: transcription_confidence ?? null,
            word_count: wordCount,
            transcription_preview: trimmedText.slice(0, 200),
            phone: normalizedPhoneAudioGate,
            decision: "sdr_invoked",
          },
        });
      } catch (_) { /* non-blocking */ }
    }

    // 1. Skip if user took manual control of this lead
    const lead = leadEarly;

    // Gate único de automação (categoria, manual, opt-out, janela compliance)
    const normalizedPhoneEarly = normalizePhone(whatsapp_number);
    const gate = await evaluateAutomationGate(supabase, {
      user_id: lead.user_id,
      phone: normalizedPhoneEarly,
      lead_id,
      agent_slug: SDR_AGENT_SLUG,
    });
    if (!gate.allowed) {
      await logAutomationBlock(supabase, gate, {
        user_id: lead.user_id,
        lead_id,
        agent_slug: SDR_AGENT_SLUG,
        stage: "inbound_routing",
        phone: normalizedPhoneEarly,
        message_preview: message_text?.slice(0, 280),
      });
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: "automation_blocked",
          block: { reason: gate.reason, metadata: gate.metadata ?? null },
        }),
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
      .eq("slug", SDR_AGENT_SLUG)
      .maybeSingle();

    if (!agentRow?.ativo) {
      return new Response(
        JSON.stringify({ ok: true, skipped: "agent_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Invoke the SDR
    const normalizedPhone = normalizedPhoneEarly;
    const { data: sdrResp, error: sdrErr } = await supabase.functions.invoke(
      "junior-sdr",
      {
        body: {
          lead_id,
          whatsapp_number: normalizedPhone,
          user_message: message_text,
          is_audio: is_audio === true,
          source_type: source_type ?? (is_audio === true ? "audio" : "text"),
          transcription_confidence:
            typeof transcription_confidence === "number" ? transcription_confidence : null,
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
      agent_escolhido: SDR_AGENT_SLUG,
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
      .eq("agent_slug", SDR_AGENT_SLUG)
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
            agent_slug: SDR_AGENT_SLUG,
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
      // ═══ HANDOFF SCORE A ═══
      // 1) Avança estágio + ativa modo manual (gate fail-closed bloqueia IA daqui em diante).
      const nowIso = new Date().toISOString();
      await supabase
        .from("leads")
        .update({
          stage: "contato_realizado",
          in_manual_conversation: true,
          assumed_at: nowIso,
          assumed_by: lead.user_id,
          updated_at: nowIso,
        })
        .eq("id", lead_id);

      // 2) Monta pacote de handoff padronizado para o corretor.
      const metaObj: any = sdrResp.metadata || {};
      const coletado: any = metaObj.coletado || {};
      const qual: any = sdrResp.qual_progress || {};
      const handoffPayload: any = sdrResp.handoff_payload || {};
      const breakdown: any = handoffPayload.breakdown || qual.breakdown || {};
      const lacunas: string[] = Array.isArray(qual.missing) ? qual.missing : [];

      // Resumo da conversa (lead_memory.summary mais recente).
      let conversaResumo: string | null = null;
      try {
        const { data: mem } = await supabase
          .from("lead_memory")
          .select("summary")
          .eq("lead_id", lead_id)
          .maybeSingle();
        conversaResumo = mem?.summary ?? null;
      } catch (_) { /* non-blocking */ }

      // Recomendação de próximo passo (com prioridade de fontes).
      const recomendacao =
        metaObj.sugestao_proxima_msg_humana ||
        (breakdown?.closing_potential?.score >= 60
          ? "Enviar 2-3 opções de cotação alinhadas ao orçamento já confirmado."
          : breakdown?.urgency?.score >= 75
            ? "Ligar agora — janela de decisão curta declarada pelo lead."
            : "Confirmar dados pendentes antes de cotar e agendar retorno.");

      const dadosLinhas = [
        coletado.tipo && `• Tipo: ${coletado.tipo}${coletado.vidas ? ` • ${coletado.vidas} vida(s)` : ""}`,
        coletado.faixa_etaria && `• Faixa etária: ${coletado.faixa_etaria}`,
        coletado.plano_atual?.operadora
          ? `• Plano atual: ${coletado.plano_atual.operadora}`
          : (coletado.plano_atual?.tem === false ? `• Plano atual: não tem` : null),
        coletado.regiao && `• Região: ${coletado.regiao}`,
        coletado.objetivo && `• Objetivo: ${coletado.objetivo}`,
        coletado.orcamento && `• Orçamento: ${coletado.orcamento}`,
      ].filter(Boolean).join("\n");

      const scoreLine = handoffPayload.score
        ? `*Score:* ${handoffPayload.score}${typeof breakdown.overall === "number" ? ` (${breakdown.overall}/100)` : ""}`
        : "*Score:* A";
      const dimsLine = breakdown && breakdown.fit
        ? `*Dimensões:* fit ${breakdown.fit?.score ?? "?"} · urgência ${breakdown.urgency?.score ?? "?"} · completude ${breakdown.completeness?.score ?? "?"} · fechamento ${breakdown.closing_potential?.score ?? "?"}`
        : "";
      const motivoLine = handoffPayload.reason || qual.reason_summary || null;

      const briefing = [
        "🎯 *Lead pronto para cotação humana — Handoff*",
        "",
        scoreLine,
        dimsLine,
        motivoLine ? `*Motivo:* ${motivoLine}` : "",
        "",
        "*Dados coletados:*",
        dadosLinhas || "(nenhum dado estruturado)",
        lacunas.length ? `\n*Pendências:* ${lacunas.join(", ")}` : "\n*Pendências:* nenhuma",
        metaObj.urgencia ? `\n*Urgência declarada:* ${metaObj.urgencia}` : "",
        metaObj.objecao_principal ? `\n*Objeção principal:* ${metaObj.objecao_principal}` : "",
        conversaResumo ? `\n*Resumo da conversa:*\n${conversaResumo.slice(0, 600)}` : "",
        `\n*Próximo passo recomendado:*\n${recomendacao}`,
        "\n_Junior pausado automaticamente — IA só volta quando você devolver a conversa._",
      ].filter(Boolean).join("\n");

      const leadName = (await supabase.from("leads").select("name,phone").eq("id", lead_id).maybeSingle()).data;
      const displayName = leadName?.name || leadName?.phone || "lead";

      await supabase.from("notifications").insert({
        user_id: lead.user_id,
        type: "lead_qualificado",
        title: `🎯 Junior qualificou ${displayName}`,
        body: briefing,
        lead_id,
      });

      // 3) Registra handoff PADRONIZADO em agent_handoffs.
      //    Pacote único com tudo que o corretor precisa para retomar sem ler histórico inteiro.
      const handoffPackage = {
        version: 1,
        handoff_at: nowIso,
        from_agent: SDR_AGENT_SLUG,
        to_agent: "humano",
        motivo: "score_A",
        score: handoffPayload.score ?? "A",
        score_breakdown: breakdown,
        score_reason: motivoLine,
        dados_coletados: coletado,
        pendencias: lacunas,
        urgencia: metaObj.urgencia ?? null,
        objecao_principal: metaObj.objecao_principal ?? null,
        recomendacao_proximo_passo: recomendacao,
        resumo_conversa: conversaResumo,
        manual_mode_activated: true,
        retomada: {
          como: "Botão 'Devolver pra Junior' no header da conversa OU desativar in_manual_conversation no lead.",
          contexto_preservado: true,
        },
      };
      try {
        await supabase.from("agent_handoffs").insert({
          conversation_id: sdrResp.conversation_id ?? null,
          from_agent: SDR_AGENT_SLUG,
          to_agent: "humano",
          motivo: "score_A",
          contexto_transferido: handoffPackage,
        });
      } catch (e) {
        console.warn("[handoff] insert agent_handoffs failed:", e instanceof Error ? e.message : e);
      }

      // 4) Log auditável da pausa automática.
      try {
        await supabase.from("action_log").insert({
          user_id: lead.user_id,
          lead_id,
          action_type: "agent_paused_handoff",
          metadata: {
            agent_slug: SDR_AGENT_SLUG,
            trigger: "score_A_handoff",
            score: handoffPayload.score ?? "A",
            overall: breakdown?.overall ?? null,
            pendencias: lacunas,
          },
        });
      } catch (_) { /* non-blocking */ }
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
        agent: SDR_AGENT_SLUG,
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