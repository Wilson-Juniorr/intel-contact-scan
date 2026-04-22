// Wrapper that invokes agent-call with the SDR slug and humanizes the output
// (splits into 1-3 balloons, returns randomized delays, marks "digitando" state).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AGENT_SLUG = "sdr-qualificador";

function splitEmBaloes(texto: string): string[] {
  const semJson = texto.replace(/```json[\s\S]*?```/g, "").trim();
  const paragrafos = semJson
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragrafos.length === 0) return [texto.trim()].filter(Boolean);
  if (paragrafos.length === 1) {
    const linhas = paragrafos[0].split("\n").filter((l) => l.trim());
    if (linhas.length <= 3) return paragrafos;
    const metade = Math.ceil(linhas.length / 2);
    return [
      linhas.slice(0, metade).join("\n"),
      linhas.slice(metade).join("\n"),
    ];
  }
  if (paragrafos.length <= 3) return paragrafos;
  return [paragrafos[0], paragrafos[1], paragrafos.slice(2).join("\n\n")];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lead_id, whatsapp_number, user_message, conversation_id: convIn } =
      await req.json();

    if (!lead_id || !whatsapp_number || !user_message) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "lead_id, whatsapp_number and user_message are required",
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

    // 1. Find or create the active conversation for this lead+agent
    let conversation_id: string | null = convIn ?? null;
    if (!conversation_id) {
      const { data: existing } = await supabase
        .from("agent_conversations")
        .select("id")
        .eq("lead_id", lead_id)
        .eq("agent_slug", AGENT_SLUG)
        .in("status", ["ativa", "digitando", "pausada"])
        .order("ultima_atividade", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        conversation_id = existing.id;
      } else {
        const { data: novo, error: convErr } = await supabase
          .from("agent_conversations")
          .insert({
            lead_id,
            agent_slug: AGENT_SLUG,
            whatsapp_number,
            status: "ativa",
            mensagens: [],
          })
          .select("id")
          .single();
        if (convErr) throw convErr;
        conversation_id = novo!.id;
      }
    }

    // 2. Mark "digitando" so the UI can show typing indicator live
    await supabase
      .from("agent_conversations")
      .update({
        status: "digitando",
        ultima_atividade: new Date().toISOString(),
      })
      .eq("id", conversation_id);

    // 3. Load lightweight lead context for the agent
    const { data: lead } = await supabase
      .from("leads")
      .select("id, name, phone, stage, type, operator")
      .eq("id", lead_id)
      .maybeSingle();

    const { data: memoryRow } = await supabase
      .from("lead_memory")
      .select("summary")
      .eq("lead_id", lead_id)
      .maybeSingle();

    const extra_context = {
      lead_name: lead?.name ?? null,
      lead_phone: lead?.phone ?? whatsapp_number,
      lead_stage: lead?.stage ?? "novo",
      lead_type: lead?.type ?? "PF",
      lead_operator: lead?.operator ?? null,
      lead_memoria_resumo: memoryRow?.summary ?? null,
    };

    // 4. Invoke the central agent-call function (handles LLM + persistence)
    const { data: agentResp, error: agentErr } = await supabase.functions.invoke(
      "agent-call",
      {
        body: {
          agent_slug: AGENT_SLUG,
          conversation_id,
          user_message,
          extra_context,
        },
      },
    );
    if (agentErr) throw agentErr;

    const responseText: string =
      agentResp?.response ?? agentResp?.text ?? agentResp?.message ?? "";

    // 5. Switch back to "ativa"
    await supabase
      .from("agent_conversations")
      .update({ status: "ativa", ultima_atividade: new Date().toISOString() })
      .eq("id", conversation_id);

    // 6. Humanize: split into 1-3 balloons
    const baloes = splitEmBaloes(responseText);
    const delays_ms = baloes.map(() => 1500 + Math.floor(Math.random() * 5500));

    // 7. Detect qualification JSON marker
    const qualificou = /"qualificado"\s*:\s*true/i.test(responseText);

    return new Response(
      JSON.stringify({
        ok: true,
        conversation_id,
        mensagens: baloes,
        delays_ms,
        qualificou,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sdr-qualificador error:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});