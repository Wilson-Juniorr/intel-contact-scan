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

async function analyzeWithAI(base64: string, mimetype: string, type: "image" | "document"): Promise<string | null> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) return null;

  const dataUri = `data:${mimetype};base64,${base64}`;

  const prompt = type === "image"
    ? `Analise esta imagem em detalhes. Se for uma proposta de plano de saúde, extraia:
- Operadora e nome do plano
- Valores mensais
- Tipo de acomodação
- Cobertura/abrangência
- Coparticipação
- Rede credenciada mencionada

Se for outro tipo de imagem (print de conversa, tabela de preços, etc.), descreva o conteúdo relevante.

Retorne uma descrição concisa e estruturada. Sem saudações ou explicações desnecessárias.`
    : `Analise este documento PDF em detalhes. Se for uma proposta de plano de saúde, extraia:
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

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
      console.error("AI analysis error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error("AI analysis error:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message_id, uazapi_message_id, message_type } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const uazapiId = uazapi_message_id || message_id;
    if (!uazapiId) throw new Error("message_id or uazapi_message_id required");

    const type = (message_type === "document") ? "document" : "image";
    console.log(`Analyzing ${type}: ${uazapiId}`);

    // Download media
    const media = await downloadFromUazapi(uazapiId);
    if (!media) {
      console.log("Could not download media, skipping analysis");
      return new Response(JSON.stringify({ analyzed: false, reason: "download_failed" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine mimetype
    let mime = media.mimetype;
    if (!mime || mime === "") {
      mime = type === "document" ? "application/pdf" : "image/jpeg";
    }

    // Analyze with AI
    const description = await analyzeWithAI(media.base64, mime, type);
    if (!description) {
      return new Response(JSON.stringify({ analyzed: false, reason: "ai_failed" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update message content with analysis
    const prefix = type === "document" ? "📄" : "🖼️";
    const existingContentSuffix = message_id ? "" : "";

    if (message_id) {
      // Update by DB message ID
      const { data: msg } = await supabase
        .from("whatsapp_messages")
        .select("content")
        .eq("id", message_id)
        .single();

      const existingContent = msg?.content || "";
      const newContent = existingContent
        ? `${existingContent}\n${prefix} ${description}`
        : `${prefix} ${description}`;

      await supabase
        .from("whatsapp_messages")
        .update({ content: newContent })
        .eq("id", message_id);
    }

    console.log(`Analysis complete: ${description.slice(0, 100)}...`);

    return new Response(JSON.stringify({ analyzed: true, description }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Analyze error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
