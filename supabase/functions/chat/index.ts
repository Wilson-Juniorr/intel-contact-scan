import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, crmContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemContent = `Você é um assistente especialista em planos de saúde no Brasil. Seu nome é CRM Saúde IA.

Você tem ACESSO TOTAL aos dados do CRM do corretor. Use esses dados para responder perguntas sobre:
- Quantos leads existem, em quais etapas do funil estão
- Quais leads estão parados há muito tempo e precisam de atenção
- Informações específicas sobre qualquer lead (nome, telefone, operadora, vidas, etc.)
- Resumos e análises do pipeline de vendas
- Sugestões de próximos passos e priorização de contatos
- Estatísticas e métricas do negócio

Além disso, você ajuda com:
- Informações sobre operadoras (Unimed, Amil, Bradesco Saúde, SulAmérica, Hapvida, Porto Seguro, etc.)
- Carências, coberturas, reajustes e regras da ANS
- Diferenças entre planos PF, PJ, PME
- Estratégias de venda e abordagem de leads
- Geração de mensagens de follow-up para WhatsApp
- Comparação entre planos e operadoras
- Dicas de negociação e fechamento

Seja direto, prático e use linguagem acessível. Quando citar dados do CRM, seja preciso.
Sempre que possível, dê exemplos e dicas práticas.

${crmContext || "Nenhum dado do CRM disponível no momento."}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemContent },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no assistente IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
