import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // JWT validation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    const { leadId, userContext } = await req.json();
    if (!leadId) throw new Error("leadId é obrigatório");

    // Load lead from DB, ensure it belongs to user
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("user_id", userId)
      .single();
    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: "Lead não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load last 10 interactions
    const { data: interactions } = await supabase
      .from("interactions")
      .select("*")
      .eq("lead_id", leadId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Calculate idle time
    const lastActivity = lead.last_contact_at || lead.updated_at || lead.created_at;
    const diffMs = Date.now() - new Date(lastActivity).getTime();
    const idleHours = Math.floor(diffMs / (1000 * 60 * 60));
    const idleDays = Math.floor(idleHours / 24);

    const stageLabels: Record<string, string> = {
      novo: "Novo Negócio",
      tentativa_contato: "Tentativa de Contato",
      contato_realizado: "Contato Realizado",
      cotacao_enviada: "Cotação Enviada",
      cotacao_aprovada: "Cotação Aprovada",
      documentacao_completa: "Documentação Completa",
      em_emissao: "Em Emissão",
      aguardando_implantacao: "Aguardando Implantação",
      implantado: "Implantado",
      retrabalho: "Retrabalho",
      declinado: "Declinado",
      cancelado: "Cancelado",
    };

    const stageLabel = stageLabels[lead.stage] || lead.stage;

    const interactionsSummary = (interactions || [])
      .map((i: any) => `[${i.type}] ${i.description} (${new Date(i.created_at).toLocaleDateString("pt-BR")})`)
      .join("\n");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Você é um especialista em vendas de planos de saúde. Gere UMA mensagem de follow-up para WhatsApp.

REGRAS:
- Mensagem curta, profissional e amigável
- Use o primeiro nome do lead
- Adapte o tom conforme a etapa do funil e tempo sem contato
- NÃO use emojis excessivos (máximo 2)
- NÃO inclua saudação formal demais
- Inclua um CTA sutil no final
- NUNCA prometa cobertura ou valores exatos sem confirmação
- Responda APENAS com a mensagem, sem explicações

CONTEXTO DA ETAPA:
- "Novo Negócio" / "Tentativa de Contato": Abertura + tentativa de contato + pergunta simples
- "Contato Realizado": Reforce o interesse, pergunte se ficou alguma dúvida
- "Cotação Enviada": Lembre a cotação + ofereça ajuste + CTA
- "Cotação Aprovada": Parabenize e agilize a documentação
- "Documentação Completa" / "Em Emissão": Atualização de status + próximo passo
- "Retrabalho": Entenda o problema e ofereça solução

Se parado há muito tempo (>=5 dias), seja mais direto e urgente.
Se parado há pouco tempo (1-2 dias), seja mais casual.`,
          },
          {
            role: "user",
            content: `Gere uma mensagem de follow-up para:
- Nome: ${lead.name}
- Etapa atual: ${stageLabel}
- Tipo: ${lead.type === "PF" ? "Pessoa Física" : lead.type === "PME" ? "PME" : "Adesão"}
- Operadora: ${lead.operator || "não definida"}
- Vidas: ${lead.lives || "não informado"}
- Tempo sem contato: ${idleDays} dias (${idleHours} horas)
- Notas: ${lead.notes || "nenhuma"}
${interactionsSummary ? `\nÚLTIMAS INTERAÇÕES:\n${interactionsSummary}` : ""}${userContext ? `\n\nCONTEXTO DO VENDEDOR:\n${userContext}` : ""}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Erro ao gerar mensagem");
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message?.content || "Erro ao gerar mensagem";

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("follow-up error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
