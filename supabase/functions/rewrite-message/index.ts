import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const {
      currentText,
      leadId,
      objective,
      context: userContext,
      tone,
      shortMode,
      naturalMode,
      leadStage,
      leadType,
      leadOperator,
      leadLives,
      leadName,
    } = await req.json();

    if (!currentText || !currentText.trim()) {
      return new Response(
        JSON.stringify({ error: "currentText is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load lead interactions if leadId provided
    let interactionsSummary = "";
    if (leadId) {
      // Verify lead belongs to user
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("id, name, stage, type, operator, lives")
        .eq("id", leadId)
        .single();

      if (leadError || !lead) {
        console.log("Lead not found or not owned by user:", leadId);
      } else {
        const { data: interactions } = await supabase
          .from("interactions")
          .select("type, description, created_at")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(5);

        if (interactions && interactions.length > 0) {
          interactionsSummary = interactions
            .map((i) => `- [${i.type}] ${i.description.slice(0, 80)}`)
            .join("\n");
        }
      }
    }

    const toneDescriptions: Record<string, string> = {
      profissional: "tom formal e corporativo, mantendo credibilidade",
      humano: "tom acolhedor e empático, como uma conversa entre amigos",
      direto: "tom objetivo e sem rodeios, indo direto ao ponto",
      persuasivo: "tom que destaca benefícios e cria senso de oportunidade",
      urgente: "tom que transmite urgência e escassez, com call-to-action forte",
      consultivo: "tom de especialista que orienta e educa o cliente",
    };

    const toneInstruction = toneDescriptions[tone] || toneDescriptions.profissional;

    const systemPrompt = `Você é um copywriter especialista em vendas consultivas de planos de saúde no Brasil.

REGRAS ABSOLUTAS:
- NUNCA prometer valores, coberturas ou prazos específicos sem confirmação.
- NUNCA parecer um bot ou usar frases genéricas de IA.
- Usar linguagem natural do WhatsApp brasileiro (sem exagerar em emojis).
- Respeitar o tom solicitado.
- Incluir call-to-action claro.
${shortMode ? "- LIMITE: cada variação deve ter NO MÁXIMO 320 caracteres." : ""}
${naturalMode ? "- IMPORTANTE: o texto DEVE parecer escrito por uma pessoa real, não por um robô. Use contrações, gírias leves e naturalidade." : ""}

CONTEXTO DO LEAD:
- Nome: ${leadName || "não informado"}
- Estágio no funil: ${leadStage || "não informado"}
- Modalidade: ${leadType || "não informado"}
- Operadora: ${leadOperator || "não informada"}
- Vidas: ${leadLives || "não informado"}
${interactionsSummary ? `\nÚltimas interações:\n${interactionsSummary}` : ""}
${objective ? `\nObjetivo do vendedor: ${objective}` : ""}
${userContext ? `\nContexto adicional: ${userContext}` : ""}

TOM: ${toneInstruction}

TAREFA:
Reescreva a mensagem abaixo em EXATAMENTE 3 variações:
1. "Curta" — mais concisa possível, direto ao ponto
2. "Equilibrada" — bom equilíbrio entre informação e brevidade
3. "Persuasiva" — mais elaborada, com argumentação e CTA forte

Responda APENAS com um JSON válido no formato:
{"variants": ["variação curta", "variação equilibrada", "variação persuasiva"]}

Sem explicações, sem markdown, sem comentários. Apenas o JSON.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: currentText.trim() },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error [${response.status}]`);
    }

    const aiData = await response.json();
    const rawContent = aiData.choices?.[0]?.message?.content?.trim();

    if (!rawContent) {
      throw new Error("Empty AI response");
    }

    // Parse JSON from response (handle potential markdown wrapping)
    let parsed: { variants: string[] };
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*"variants"[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("Failed to parse AI response:", rawContent.slice(0, 500));
      // Fallback: try to extract any array-like content
      throw new Error("Falha ao processar resposta da IA. Tente novamente.");
    }

    if (!Array.isArray(parsed.variants) || parsed.variants.length < 3) {
      throw new Error("AI returned invalid variants");
    }

    return new Response(
      JSON.stringify({ variants: parsed.variants.slice(0, 3) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("rewrite-message error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
