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
      console.error("No auth header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) {
      console.error("Auth failed:", authErr?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    console.log("Authenticated user:", userData.user.id);

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

      // Fetch WhatsApp messages
      const { data: messages } = await supabase
        .from("whatsapp_messages")
        .select("id, content, extracted_text, extracted_semantic_summary, extracted_entities, message_type, direction, message_category, business_relevance_score, created_at, uazapi_message_id, media_url, processing_status")
        .eq("lead_id", lead_id)
        .order("created_at", { ascending: false })
        .limit(100);

      // Try to process unprocessed media (audio/documents that might contain quote data)
      if (messages) {
        const unprocessedMedia = messages.filter((m: any) => 
          ["audio", "ptt", "document", "image"].includes(m.message_type) && 
          !m.extracted_text && 
          (m.processing_status === "none" || m.processing_status === null || m.processing_status === "pending")
        );
        
        if (unprocessedMedia.length > 0) {
          console.log(`Found ${unprocessedMedia.length} unprocessed media, triggering processing...`);
          const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
          
          // Process up to 3 most recent media items (to avoid timeout)
          const toProcess = unprocessedMedia.slice(0, 3);
          const processPromises = toProcess.map(async (m: any) => {
            try {
              const resp = await fetch(`${SUPABASE_URL}/functions/v1/process-message-media`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messageId: m.id }),
              });
              if (resp.ok) {
                const result = await resp.json();
                if (result.processed && result.extractedText) {
                  // Update local reference so we can use it
                  m.extracted_text = result.extractedText;
                  m.extracted_semantic_summary = result.semanticSummary || null;
                  m.extracted_entities = result.entities || {};
                  console.log(`Processed ${m.message_type} inline: ${result.extractedText?.slice(0, 80)}`);
                }
              }
            } catch (e) {
              console.error(`Inline process error for ${m.id}:`, e);
            }
          });
          await Promise.all(processPromises);
        }
      }

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

      console.log(`Messages found: ${messages.length}`);
      
      if (messages && messages.length > 0) {
        // Use ALL messages that have any content (text, extracted_text, summary, entities)
        // Don't filter aggressively — many messages may not be classified yet
        const msgsWithContent = messages.filter((m: any) => 
          m.content || m.extracted_text || m.extracted_semantic_summary || 
          (m.extracted_entities && typeof m.extracted_entities === "object" && Object.keys(m.extracted_entities as object).length > 0)
        );

        // If classified messages exist, prioritize them, otherwise use all with content
        const businessMsgs = msgsWithContent.filter((m: any) => 
          m.message_category === "business" || m.message_category === "quote" || m.message_category === "health_content" || m.message_category === "documents" ||
          (m.business_relevance_score && m.business_relevance_score >= 0.5) ||
          (m.extracted_text && m.extracted_text.length > 100)  // Long extracted text = likely important
        );

        // Put business/extracted messages FIRST, then other messages
        const otherMsgs = msgsWithContent.filter((m: any) => !businessMsgs.includes(m));
        const relevantMsgs = [...businessMsgs, ...otherMsgs].slice(0, 50);
        
        console.log(`Business msgs: ${businessMsgs.length}, with content: ${msgsWithContent.length}, using: ${relevantMsgs.length}`);

        parts.push("\nMENSAGENS RELEVANTES:");
        for (const m of relevantMsgs.slice(0, 50)) {
          const msg = m as any;
          const dir = msg.direction === "inbound" ? "CLIENTE" : "CORRETOR";
          const lines: string[] = [];
          
          if (msg.content) lines.push(msg.content);
          if (msg.extracted_text && msg.extracted_text !== msg.content) lines.push(`[Texto extraído: ${msg.extracted_text}]`);
          if (msg.extracted_semantic_summary) lines.push(`[Resumo: ${msg.extracted_semantic_summary}]`);
          if (msg.extracted_entities && typeof msg.extracted_entities === "object" && Object.keys(msg.extracted_entities as object).length > 0) {
            lines.push(`[Entidades: ${JSON.stringify(msg.extracted_entities)}]`);
          }
          // For media without extracted content, note the type
          if (lines.length === 0 && msg.message_type !== "text") {
            lines.push(`[${msg.message_type} enviado - sem transcrição disponível]`);
          }

          if (lines.length > 0) {
            parts.push(`${dir}: ${lines.join(" | ")}`);
          }
        }
      }

      contextText = parts.join("\n");
      console.log("Context text length:", contextText.length, "parts:", parts.length);
      console.log("Context preview:", contextText.slice(0, 500));
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
${contextText.slice(0, 20000)}`;

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
    console.log("AI raw response:", raw.slice(0, 500));

    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.error("No JSON found in AI response");
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
