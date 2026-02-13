import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function downloadFromUazapi(messageId: string): Promise<{ base64: string; mimetype: string } | null> {
  const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
  if (!UAZAPI_URL || !UAZAPI_TOKEN) return null;

  const baseUrl = UAZAPI_URL.replace(/\/+$/, "");
  const shortId = messageId.includes(":") ? messageId.split(":").pop()! : messageId;

  try {
    const resp = await fetch(`${baseUrl}/message/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
      body: JSON.stringify({ id: shortId, return_base64: true }),
    });

    if (!resp.ok) { await resp.text(); return null; }

    const data = await resp.json();
    const b64 = data.base64Data || data.base64 || data.data || data.result;
    if (b64 && typeof b64 === "string" && b64.length > 100) {
      return { base64: b64, mimetype: data.mimetype || data.mimeType || "" };
    }
  } catch (e) {
    console.error("Download error:", e);
  }
  return null;
}

interface ClassificationResult {
  message_category: string;
  business_relevance_score: number;
  intent: string;
  classification_confidence: string;
}

function classifyTextMessage(content: string | null): ClassificationResult {
  if (!content || content.trim().length === 0) {
    return { message_category: "unknown", business_relevance_score: 0, intent: "none", classification_confidence: "low" };
  }
  const t = content.toLowerCase().trim();

  // Greeting / small talk patterns
  const greetingPatterns = [
    /^(bom dia|boa tarde|boa noite|oi|olá|ola|hey|eai|e ai|fala)/,
    /(bom dia|boa tarde|boa noite|feliz|abençoado|abençoada|blessed|sexta|segunda|terça|quarta|quinta|sábado|domingo)/,
    /(bença|deus|amém|gratidão|paz|🙏|😊|🌅|🌞|☀️|🙌|❤️|💛)/,
  ];
  const memePatterns = [
    /(kkkk|hahah|kkk|rsrs|😂|🤣|😅|😆)/,
    /^(sticker|figurinha)/,
  ];
  const healthPatterns = [
    /(plano|saúde|saude|operadora|unimed|amil|bradesco|sulamerica|sul ?américa|hapvida|notredame|intermédica|intermedica|golden|cross|coparticipação|coparticipacao|carência|carencia|enfermaria|apartamento|rede credenciada|hospital|clínica|clinica)/,
    /(cotação|cotacao|proposta|orçamento|orcamento|reajuste|mensalidade|fatura|boleto|implantação|implantacao|vigência|vigencia)/,
    /(cpf|rg|contrato|documentação|documentacao|carteirinha|ans|beneficiário|beneficiario|titular|dependente)/,
  ];
  const quotePatterns = [
    /(cotação|cotacao|proposta|orçamento|orcamento|valor|preço|preco|R\$|reais|mensalidade|tabela)/,
  ];
  const docPatterns = [
    /(cpf|rg|cnh|documento|certidão|certidao|comprovante|contrato|declaração|declaracao)/,
  ];

  // Check patterns
  const isGreeting = greetingPatterns.some(p => p.test(t));
  const isMeme = memePatterns.some(p => p.test(t));
  const isHealth = healthPatterns.some(p => p.test(t));
  const isQuote = quotePatterns.some(p => p.test(t));
  const isDoc = docPatterns.some(p => p.test(t));

  // Short messages that are purely greetings
  if (t.length < 60 && isGreeting && !isHealth && !isQuote && !isDoc) {
    return { message_category: "greeting", business_relevance_score: 0.1, intent: "greeting", classification_confidence: "high" };
  }
  if (isMeme && !isHealth) {
    return { message_category: "meme_sticker", business_relevance_score: 0.05, intent: "none", classification_confidence: "high" };
  }
  if (isQuote) {
    return { message_category: "quote", business_relevance_score: 0.95, intent: "quote_followup", classification_confidence: "medium" };
  }
  if (isDoc) {
    return { message_category: "documents", business_relevance_score: 0.9, intent: "ask_docs", classification_confidence: "medium" };
  }
  if (isHealth) {
    return { message_category: "health_content", business_relevance_score: 0.85, intent: "qualify", classification_confidence: "medium" };
  }
  // Default: moderate relevance for unrecognized content
  return { message_category: "small_talk", business_relevance_score: 0.3, intent: "none", classification_confidence: "low" };
}

async function classifyWithAI(extractedText: string, mediaType: string): Promise<ClassificationResult> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return classifyTextMessage(extractedText);

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{
          role: "user",
          content: `Classifique esta mensagem de WhatsApp (tipo: ${mediaType}). Retorne APENAS um JSON:
{"message_category":"health_content|quote|documents|admin|greeting|small_talk|meme_sticker|unknown","business_relevance_score":0.0-1.0,"intent":"qualify|quote_followup|ask_docs|schedule_call|greeting|nudge|none","confidence":"low|medium|high"}

Regras:
- Imagens de bom dia, motivacionais, memes, stickers = greeting ou meme_sticker, relevância < 0.2
- Cotações, propostas, tabelas de preços = quote, relevância > 0.8
- Documentos pessoais (CPF, RG, contrato) = documents, relevância > 0.8
- Conteúdo sobre planos de saúde = health_content, relevância > 0.7
- Conversa casual sem relação com negócio = small_talk, relevância < 0.3

Texto/conteúdo extraído:
"${extractedText.slice(0, 500)}"`,
        }],
      }),
    });
    if (!resp.ok) { await resp.text(); return classifyTextMessage(extractedText); }
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      message_category: parsed.message_category || "unknown",
      business_relevance_score: Math.min(1, Math.max(0, Number(parsed.business_relevance_score) || 0)),
      intent: parsed.intent || "none",
      classification_confidence: parsed.confidence || "low",
    };
  } catch {
    return classifyTextMessage(extractedText);
  }
}

async function extractTextWithAI(base64: string, mimetype: string, type: "audio" | "image" | "document"): Promise<{ extractedText: string | null; semanticSummary: string | null; entities: Record<string, any> }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return { extractedText: null, semanticSummary: null, entities: {} };

  const dataUri = `data:${mimetype};base64,${base64}`;

  let prompt: string;
  if (type === "audio") {
    prompt = `Transcreva este áudio de voz em português brasileiro com precisão. 

Retorne um JSON com:
{
  "transcription": "texto transcrito aqui",
  "semantic_summary": "resumo em 1-2 frases do que a pessoa está comunicando",
  "entities": {
    "operadora": null ou "nome",
    "plano": null ou "nome do plano",
    "valores": null ou [lista de valores mencionados],
    "hospitais_rede": null ou ["hospital1"],
    "objecoes": null ou ["objeção mencionada"],
    "prazos": null ou "prazo mencionado",
    "coparticipacao": null ou "detalhe",
    "vidas": null ou número,
    "modalidade": null ou "enfermaria/apartamento"
  },
  "is_social": false
}

Se o áudio for saudação social simples (bom dia, etc), coloque is_social=true e entities vazias.
Se inaudível, retorne transcription="[Áudio não compreendido]".
Retorne APENAS o JSON.`;
  } else if (type === "image") {
    prompt = `Analise esta imagem com precisão. Retorne um JSON:
{
  "extracted_text": "todo texto visível na imagem",
  "semantic_summary": "descrição do conteúdo em 2-3 frases (o que aparece, contexto visual)",
  "entities": {
    "operadora": null ou "nome da operadora",
    "plano": null ou "nome do plano",
    "valores": null ou [{"faixa": "0-18", "valor": 150.00}],
    "hospitais_rede": null ou ["hospital1"],
    "coparticipacao": null ou "sim/não + detalhes",
    "carencia": null ou "detalhes de carência",
    "abrangencia": null ou "municipal/estadual/nacional",
    "acomodacao": null ou "enfermaria/apartamento",
    "vidas": null ou número,
    "modalidade": null ou "tipo"
  },
  "is_social": boolean
}

REGRAS CRÍTICAS:
- Imagens motivacionais, bom dia, memes, frases inspiracionais, stickers = is_social=true, entities vazias
- Propostas, cotações, tabelas de preço = is_social=false, extrair TODOS os dados possíveis
- Prints de conversa sobre plano = is_social=false, extrair contexto relevante
- Se não conseguir extrair texto, descreva o conteúdo visual semanticamente
Retorne APENAS o JSON.`;
  } else {
    prompt = `Analise este documento em detalhes. Retorne um JSON:
{
  "extracted_text": "texto principal extraído do documento",
  "semantic_summary": "resumo estruturado do documento em 3-5 frases",
  "entities": {
    "operadora": null ou "nome da operadora",
    "plano": null ou "nome do plano",
    "valores": null ou [{"faixa": "0-18", "valor": 150.00}, ...],
    "hospitais_rede": null ou ["hospital1", "hospital2"],
    "coparticipacao": null ou "detalhes completos",
    "carencia": null ou "prazos de carência",
    "abrangencia": null ou "municipal/estadual/nacional",
    "acomodacao": null ou "enfermaria/apartamento",
    "vidas": null ou número,
    "modalidade": null ou "tipo",
    "condicoes_especiais": null ou "condições negociadas",
    "vigencia": null ou "data de vigência"
  },
  "is_social": false
}

Extraia o MÁXIMO de dados estruturados possível. Se for scan/imagem, faça OCR.
Retorne APENAS o JSON.`;
  }

  try {
    const model = "google/gemini-2.5-flash";
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.error("AI error:", response.status, await response.text());
      return { extractedText: null, semanticSummary: null, entities: {} };
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || "";
    
    // Try to parse as JSON
    try {
      const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      
      const extractedText = type === "audio" 
        ? (parsed.transcription || parsed.extracted_text || rawContent)
        : (parsed.extracted_text || rawContent);
      const semanticSummary = parsed.semantic_summary || null;
      const entities = parsed.entities || {};
      const isSocial = parsed.is_social === true;
      
      // If social, prefix with [SOCIAL]
      if (isSocial && type !== "audio") {
        return { 
          extractedText: `[SOCIAL] ${semanticSummary || extractedText}`, 
          semanticSummary, 
          entities: {} 
        };
      }
      
      return { extractedText, semanticSummary, entities };
    } catch {
      // Fallback: use raw content as text
      return { extractedText: rawContent, semanticSummary: null, entities: {} };
    }
  } catch (e) {
    console.error("AI extraction error:", e);
    return { extractedText: null, semanticSummary: null, entities: {} };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messageId } = await req.json();
    if (!messageId) throw new Error("messageId is required");

    // Use service role for server-to-server calls (called from webhook/sync)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get message
    const { data: msg, error: msgErr } = await supabase
      .from("whatsapp_messages")
      .select("id, message_type, uazapi_message_id, media_url, content, processing_status, user_id, lead_id, phone")
      .eq("id", messageId)
      .single();

    if (msgErr || !msg) {
      return new Response(JSON.stringify({ processed: false, reason: "message_not_found" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: skip if already done
    if (msg.processing_status === "done" || msg.processing_status === "processing") {
      return new Response(JSON.stringify({ processed: false, reason: "already_processed" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mediaTypes = ["audio", "ptt", "image", "document"];
    if (!mediaTypes.includes(msg.message_type)) {
      return new Response(JSON.stringify({ processed: false, reason: "not_media" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as processing
    await supabase.from("whatsapp_messages").update({ processing_status: "processing" }).eq("id", messageId);

    console.log(`Processing ${msg.message_type} message: ${messageId}`);

    // Download media
    const uazapiId = msg.uazapi_message_id;
    let media: { base64: string; mimetype: string } | null = null;

    if (uazapiId) {
      media = await downloadFromUazapi(uazapiId);
    }

    if (!media) {
      await supabase.from("whatsapp_messages").update({
        processing_status: "failed",
        processing_error: "download_failed",
      }).eq("id", messageId);

      return new Response(JSON.stringify({ processed: false, reason: "download_failed" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save to storage
    let storagePath: string | null = null;
    if (msg.user_id) {
      const ext = getExtension(msg.message_type, media.mimetype);
      storagePath = `${msg.user_id}/${msg.phone}/${messageId}.${ext}`;

      // Decode base64 to Uint8Array
      const binaryStr = atob(media.base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const { error: uploadErr } = await supabase.storage
        .from("whatsapp-media")
        .upload(storagePath, bytes, {
          contentType: media.mimetype || "application/octet-stream",
          upsert: true,
        });

      if (uploadErr) {
        console.error("Storage upload error:", uploadErr.message);
        storagePath = null; // Non-blocking, continue with extraction
      } else {
        console.log("Media saved to storage:", storagePath);
      }
    }

    // Extract text with AI
    const type = (msg.message_type === "audio" || msg.message_type === "ptt") ? "audio"
      : msg.message_type === "image" ? "image" : "document";

    // Determine mimetype
    let mime = media.mimetype;
    if (!mime) {
      if (type === "audio") mime = "audio/ogg";
      else if (type === "image") mime = "image/jpeg";
      else mime = "application/pdf";
    }

    const result = await extractTextWithAI(media.base64, mime, type);
    const extractedText = result.extractedText;
    const semanticSummary = result.semanticSummary;
    const entities = result.entities;

    // Classify the message content
    const textForClassification = extractedText || msg.content || "";
    let classification: ClassificationResult;
    if (extractedText && (type === "image" || type === "document")) {
      // Use AI classification for media with extracted text
      classification = await classifyWithAI(extractedText, type);
    } else {
      classification = classifyTextMessage(textForClassification);
    }

    // Auto-detect social content from extraction prefix
    if (extractedText?.startsWith("[SOCIAL]")) {
      classification = {
        message_category: "greeting",
        business_relevance_score: 0.1,
        intent: "greeting",
        classification_confidence: "high",
      };
    }

    // Update message
    const prefix = type === "audio" ? "🎤" : type === "image" ? "🖼️" : "📄";
    const updateData: any = {
      processing_status: extractedText ? "done" : "failed",
      processing_error: extractedText ? null : "extraction_failed",
      message_category: classification.message_category,
      business_relevance_score: classification.business_relevance_score,
      intent: classification.intent,
      classification_confidence: classification.classification_confidence,
    };

    if (storagePath) updateData.media_storage_path = storagePath;
    if (semanticSummary) updateData.extracted_semantic_summary = semanticSummary;
    if (entities && Object.keys(entities).length > 0 && Object.values(entities).some(v => v !== null)) {
      updateData.extracted_entities = entities;
    }

    if (extractedText) {
      updateData.extracted_text = extractedText;

      const existingContent = msg.content || "";
      if (type === "audio") {
        updateData.content = `${prefix} ${extractedText}`;
      } else {
        updateData.content = existingContent
          ? `${existingContent}\n${prefix} ${extractedText}`
          : `${prefix} ${extractedText}`;
      }
    }

    await supabase.from("whatsapp_messages").update(updateData).eq("id", messageId);

    console.log(`Processing complete for ${messageId}: ${extractedText ? "success" : "failed"}`);

    // If we extracted text and have a lead, trigger memory update (non-blocking)
    if (extractedText && msg.lead_id) {
      try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        fetch(`${SUPABASE_URL}/functions/v1/update-lead-memory`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: msg.lead_id, userId: msg.user_id }),
        }).catch(() => {}); // Fire and forget
      } catch {}
    }

    return new Response(JSON.stringify({
      processed: true,
      extractedText: extractedText ? extractedText.slice(0, 200) : null,
      semanticSummary: semanticSummary ? semanticSummary.slice(0, 300) : null,
      entities: entities || {},
      storagePath,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Process media error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getExtension(messageType: string, mimetype: string): string {
  if (mimetype) {
    if (mimetype.includes("mp3")) return "mp3";
    if (mimetype.includes("ogg")) return "ogg";
    if (mimetype.includes("mp4")) return "mp4";
    if (mimetype.includes("pdf")) return "pdf";
    if (mimetype.includes("png")) return "png";
    if (mimetype.includes("jpeg") || mimetype.includes("jpg")) return "jpg";
    if (mimetype.includes("webp")) return "webp";
  }
  switch (messageType) {
    case "audio": case "ptt": return "ogg";
    case "image": return "jpg";
    case "document": return "pdf";
    case "video": return "mp4";
    default: return "bin";
  }
}
