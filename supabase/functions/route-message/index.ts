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
      contexto_avaliado: { stage, lead_id, is_first_meaningful_touch: isFirstMeaningfulTouch, business_relevance_score: relevantInbound?.business_relevance_score ?? null },
      agent_escolhido: "sdr-qualificador",
      motivo: isFirstMeaningfulTouch ? `novo_lead: stage=${stage}` : `lead_existente: stage=${stage}`,
    });

    // 5. Send each balloon with a humanized delay via send-whatsapp
    const mensagens: string[] = sdrResp.mensagens ?? [];
    const delays: number[] = sdrResp.delays_ms ?? [];
    for (let i = 0; i < mensagens.length; i++) {
      const delay = Math.min(delays[i] ?? 3000, 8000);
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

      await supabase.from("notifications").insert({
        user_id: lead.user_id,
        type: "lead_qualificado",
        title: "Camila qualificou um lead",
        body:
          `O lead avançou para "Contato realizado". Assuma a conversa no WhatsApp para cotar.`,
        lead_id,
      });
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