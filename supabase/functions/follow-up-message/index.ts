import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lead, idleHours, idleDays } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
- Responda APENAS com a mensagem, sem explicações

CONTEXTO DA ETAPA:
- "Novo Negócio": Primeiro contato, apresente-se brevemente
- "Tentativa de Contato": Tente novamente com tom leve
- "Contato Realizado": Reforce o interesse, pergunte se ficou alguma dúvida
- "Cotação Enviada": Pergunte se analisou a cotação, ofereça tirar dúvidas
- "Cotação Aprovada": Parabenize e agilize a documentação
- "Documentação Completa": Informe próximos passos
- "Retrabalho": Entenda o problema e ofereça solução

Se parado há muito tempo (>5 dias), seja mais direto e urgente.
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
- Notas: ${lead.notes || "nenhuma"}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
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
