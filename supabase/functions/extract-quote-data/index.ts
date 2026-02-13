import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMPTY_RESULT = { min_value: null, operadora: null, plan_name: null, confidence: 0 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const { text, lead_id } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: corsHeaders });
    }

    // If lead_id provided, fetch full history from WhatsApp messages + lead_memory
    let contextText = "";

    if (lead_id) {
      // Fetch lead info
      const { data: lead } = await supabase
        .from("leads")
        .select("name, phone, type, operator, plan_type, lives, quote_min_value, quote_operadora, quote_plan_name")
        .eq("id", lead_id)
        .single();

      // Fetch WhatsApp messages with business relevance
      const { data: messages } = await supabase
        .from("whatsapp_messages")
        .select("content, extracted_text, extracted_semantic_summary, extracted_entities, message_type, direction, message_category, business_relevance_score, created_at")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: false })
        .limit(100);

      // Fetch lead memory
      const { data: memory } = await supabase
        .from("lead_memory")
        .select("summary, structured_json")
        .eq("lead_id", lead_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Build context from all sources
      const parts: string[] = [];

      if (lead) {
        parts.push(`LEAD: ${lead.name} | Tipo: ${lead.type} | Operadora atual: ${lead.operator || "?"} | Plano: ${lead.plan_type || "?"} | Vidas: ${lead.lives || "?"}`);
        if (lead.quote_min_value) parts.push(`Cotação anterior: R$${lead.quote_min_value} (${lead.quote_operadora || "?"} - ${lead.quote_plan_name || "?"})`);
      }

      if (memory?.summary) {
        parts.push(`\nMEMÓRIA DO LEAD:\n${memory.summary}`);
      }
      if (memory?.structured_json && typeof memory.structured_json === "object") {
        const sj = memory.structured_json as Record<string, unknown>;
        if (Object.keys(sj).length > 0) {
          parts.push(`DADOS ESTRUTURADOS: ${JSON.stringify(sj)}`);
        }
      }

      if (messages && messages.length > 0) {
        // Prioritize business messages with extracted content
        const businessMsgs = messages.filter((m: any) => 
          m.message_category === "business" || 
          (m.business_relevance_score && m.business_relevance_score >= 0.5) ||
          m.extracted_entities && Object.keys(m.extracted_entities as object).length > 0
        );

        const relevantMsgs = businessMsgs.length > 0 ? businessMsgs : messages.slice(0, 30);

        parts.push("\nMENSAGENS RELEVANTES:");
        for (const m of relevantMsgs.slice(0, 40)) {
          const msg = m as any;
          const dir = msg.direction === "inbound" ? "CLIENTE" : "CORRETOR";
          const lines: string[] = [];
          
          if (msg.content) lines.push(msg.content);
          if (msg.extracted_text && msg.extracted_text !== msg.content) lines.push(`[Texto extraído: ${msg.extracted_text}]`);
          if (msg.extracted_semantic_summary) lines.push(`[Resumo: ${msg.extracted_semantic_summary}]`);
          if (msg.extracted_entities && typeof msg.extracted_entities === "object" && Object.keys(msg.extracted_entities as object).length > 0) {
            lines.push(`[Entidades: ${JSON.stringify(msg.extracted_entities)}]`);
          }

          if (lines.length > 0) {
            parts.push(`${dir}: ${lines.join(" | ")}`);
          }
        }
      }

      contextText = parts.join("\n");
    } else if (text && typeof text === "string") {
      contextText = text;
    }

    if (!contextText) {
      return new Response(JSON.stringify(EMPTY_RESULT), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Você é um especialista em planos de saúde. Analise TODO o histórico abaixo (mensagens, transcrições de áudio, textos extraídos de imagens/PDFs, entidades detectadas, memória do lead) e extraia informações de cotação.

IMPORTANTE:
- Analise TODAS as fontes: texto de conversa, transcrições de áudio, OCR de imagens/PDFs, entidades extraídas, memória do lead
- Se houver múltiplas cotações, use a MAIS RECENTE
- Ignore mensagens sociais (bom dia, figurinhas, memes)
- Se não encontrar informação, retorne null para aquele campo (NÃO invente valores)

Extraia:
1. **min_value**: O MENOR valor mensal encontrado (número decimal). Pode estar em texto, áudio transcrito, imagem de cotação ou PDF.
2. **operadora**: Nome da operadora (Amil, Bradesco Saúde, SulAmérica, Unimed, etc.)
3. **plan_name**: Nome do plano (Amil 400, Blue I, Essencial, etc.)

Retorne APENAS JSON:
{"min_value": 299.90, "operadora": "Amil", "plan_name": "Amil 400", "confidence": 0.9}

Campos que não encontrar = null. Confidence: 0.9+ claro, 0.5-0.8 inferido, 0 não encontrou.

HISTÓRICO COMPLETO DO LEAD:
${contextText.slice(0, 12000)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("AI error:", response.status);
      return new Response(JSON.stringify(EMPTY_RESULT), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const raw = aiData.choices?.[0]?.message?.content?.trim() || "";

    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify(EMPTY_RESULT), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return new Response(JSON.stringify({
      min_value: typeof parsed.min_value === "number" ? parsed.min_value : null,
      operadora: parsed.operadora || null,
      plan_name: parsed.plan_name || null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-quote-data error:", error);
    return new Response(JSON.stringify(EMPTY_RESULT), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
