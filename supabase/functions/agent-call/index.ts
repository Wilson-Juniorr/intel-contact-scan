// Edge function: chama um agent via Lovable AI Gateway, atualiza conversation e salva mensagens granulares.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Lovable AI gateway é gratuito por prompt; calculamos custo simbólico só para tracking.
function estimateCost(model: string, tokensIn: number, tokensOut: number): number {
  const prices: Record<string, { in: number; out: number }> = {
    "google/gemini-3-flash-preview": { in: 0.0001, out: 0.0004 },
    "google/gemini-2.5-flash": { in: 0.0001, out: 0.0004 },
    "google/gemini-2.5-flash-lite": { in: 0.00005, out: 0.0002 },
    "google/gemini-2.5-pro": { in: 0.00125, out: 0.005 },
    "openai/gpt-5": { in: 0.005, out: 0.015 },
    "openai/gpt-5-mini": { in: 0.00025, out: 0.001 },
    "openai/gpt-5-nano": { in: 0.00005, out: 0.0002 },
  };
  const p = prices[model] || prices["google/gemini-3-flash-preview"];
  return (tokensIn / 1000) * p.in + (tokensOut / 1000) * p.out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { agent_slug, conversation_id, user_message, extra_context } = await req.json();
    if (!agent_slug || !user_message) {
      return new Response(JSON.stringify({ error: "agent_slug e user_message são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1) Buscar agent
    const { data: agent, error: agentErr } = await supabase
      .from("agents_config")
      .select("*")
      .eq("slug", agent_slug)
      .eq("ativo", true)
      .maybeSingle();

    if (agentErr || !agent) {
      return new Response(JSON.stringify({ error: `Agent ${agent_slug} não encontrado ou inativo` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Buscar conversa (opcional — se não passou, é um teste isolado)
    let conv: any = null;
    if (conversation_id) {
      const { data } = await supabase
        .from("agent_conversations")
        .select("*")
        .eq("id", conversation_id)
        .maybeSingle();
      conv = data;
    }

    const history = conv?.mensagens ?? [];
    const messages = [...history, { role: "user", content: user_message }];

    const systemPrompt =
      agent.system_prompt +
      (extra_context ? `\n\n## CONTEXTO EXTRA\n${JSON.stringify(extra_context, null, 2)}` : "");

    // 3) Chama Lovable AI Gateway (sem chave Anthropic — usa LOVABLE_API_KEY)
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: agent.modelo,
        max_tokens: agent.max_tokens,
        temperature: Number(agent.temperature),
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido — tente novamente em alguns segundos" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos esgotados — adicione créditos em Settings > Workspace > Usage" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error", detail: t }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const assistantResponse: string = aiData.choices?.[0]?.message?.content ?? "";
    const tokensIn: number = aiData.usage?.prompt_tokens ?? 0;
    const tokensOut: number = aiData.usage?.completion_tokens ?? 0;

    // 4) Persistir tudo se houver conversation
    if (conv) {
      const newMessages = [...messages, { role: "assistant", content: assistantResponse }];
      const cost = estimateCost(agent.modelo, tokensIn, tokensOut);

      await supabase
        .from("agent_conversations")
        .update({
          mensagens: newMessages,
          ultima_atividade: new Date().toISOString(),
          total_tokens_in: (conv.total_tokens_in || 0) + tokensIn,
          total_tokens_out: (conv.total_tokens_out || 0) + tokensOut,
          custo_estimado: Number((conv.custo_estimado || 0)) + cost,
        })
        .eq("id", conversation_id);

      await supabase.from("agent_messages").insert([
        { conversation_id, direcao: "incoming", conteudo: user_message, tokens_in: tokensIn },
        { conversation_id, direcao: "outgoing", conteudo: assistantResponse, tokens_out: tokensOut },
      ]);
    }

    return new Response(
      JSON.stringify({ response: assistantResponse, tokens: { in: tokensIn, out: tokensOut } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("agent-call error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
