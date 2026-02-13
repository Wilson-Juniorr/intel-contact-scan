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

async function extractTextWithAI(base64: string, mimetype: string, type: "audio" | "image" | "document"): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const dataUri = `data:${mimetype};base64,${base64}`;

  let prompt: string;
  if (type === "audio") {
    prompt = `Transcreva este áudio de voz em português brasileiro com precisão. Retorne APENAS o texto transcrito, sem aspas, sem explicações. Se inaudível, retorne '[Áudio não compreendido]'.`;
  } else if (type === "image") {
    prompt = `Analise esta imagem em detalhes. Se for uma proposta de plano de saúde, extraia:
- Operadora e nome do plano
- Valores mensais
- Tipo de acomodação
- Cobertura/abrangência
- Coparticipação
- Rede credenciada mencionada

Se for outro tipo de imagem (print de conversa, tabela de preços, etc.), descreva o conteúdo relevante.
Retorne uma descrição concisa e estruturada. Sem saudações.`;
  } else {
    prompt = `Analise este documento em detalhes. Se for uma proposta de plano de saúde, extraia:
- Operadora e nome do plano
- Valores mensais por faixa etária
- Tipo de acomodação (enfermaria/apartamento)
- Cobertura/abrangência geográfica
- Coparticipação (sim/não, valores)
- Carências
- Rede credenciada principal
- Condições especiais

Se for outro tipo de documento, extraia as informações mais relevantes de forma estruturada.
Retorne uma descrição concisa e organizada. Sem saudações.`;
  }

  try {
    const model = type === "audio" ? "google/gemini-2.5-flash" : "google/gemini-2.5-flash";
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
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error("AI extraction error:", e);
    return null;
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

    const extractedText = await extractTextWithAI(media.base64, mime, type);

    // Update message
    const prefix = type === "audio" ? "🎤" : type === "image" ? "🖼️" : "📄";
    const updateData: any = {
      processing_status: extractedText ? "done" : "failed",
      processing_error: extractedText ? null : "extraction_failed",
    };

    if (storagePath) updateData.media_storage_path = storagePath;

    if (extractedText) {
      updateData.extracted_text = extractedText;

      // Also update content with prefixed text (backwards-compatible with existing UI)
      const existingContent = msg.content || "";
      if (type === "audio") {
        // For audio, replace content entirely with transcription
        updateData.content = `${prefix} ${extractedText}`;
      } else {
        // For image/doc, append to existing content
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
