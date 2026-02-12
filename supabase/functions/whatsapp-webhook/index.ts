import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function transcribeAudio(mediaUrl: string): Promise<string | null> {
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured, skipping transcription");
      return null;
    }

    // Download audio from UaZapi
    console.log("Downloading audio from:", mediaUrl);
    const audioResp = await fetch(mediaUrl);
    if (!audioResp.ok) {
      console.error("Failed to download audio:", audioResp.status);
      return null;
    }

    const audioBuffer = await audioResp.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);

    // Convert to base64
    let binary = "";
    for (let i = 0; i < audioBytes.length; i++) {
      binary += String.fromCharCode(audioBytes[i]);
    }
    const audioBase64 = btoa(binary);

    console.log("Audio downloaded, size:", audioBytes.length, "bytes");

    // Determine format from URL or default to ogg
    let format = "ogg";
    if (mediaUrl.includes(".mp3")) format = "mp3";
    else if (mediaUrl.includes(".wav")) format = "wav";
    else if (mediaUrl.includes(".m4a")) format = "m4a";

    // Transcribe using Gemini via Lovable AI Gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um transcritor de áudio. Transcreva o áudio a seguir em português brasileiro.
REGRAS:
- Retorne APENAS a transcrição do áudio, sem explicações
- Se não conseguir transcrever, retorne "[Áudio não compreendido]"
- Mantenha pontuação e formatação natural
- Não adicione aspas ao redor da transcrição`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcreva este áudio:" },
              {
                type: "input_audio",
                input_audio: {
                  data: audioBase64,
                  format: format,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Transcription API error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    const transcription = data.choices?.[0]?.message?.content?.trim();

    if (transcription) {
      console.log("Transcription result:", transcription.slice(0, 100));
      return transcription;
    }

    return null;
  } catch (error) {
    console.error("Transcription error:", error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Accept GET for webhook verification
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "ok", message: "Webhook is active" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
    const incomingToken = req.headers.get("token") || req.headers.get("x-token") || new URL(req.url).searchParams.get("token");
    
    if (UAZAPI_TOKEN && incomingToken && incomingToken !== UAZAPI_TOKEN) {
      console.log("Invalid webhook token, rejecting");
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    console.log("Webhook RAW payload:", JSON.stringify(body).slice(0, 2000));

    let phone: string | null = null;
    let content: string | null = null;
    let messageType = "text";
    let mediaUrl: string | null = null;
    let uazapiMessageId: string | null = null;
    let isFromMe = false;

    // ===== UaZapi real format =====
    if (body.EventType === "messages" && body.chat) {
      phone = body.chat.phone?.replace(/\D/g, "") || null;
      isFromMe = body.fromMe === true || body.message?.fromMe === true;
      uazapiMessageId = body.message?.id || body.message?.key?.id || null;

      const m = body.message || {};
      content = m.body || m.text || m.conversation || m.caption || null;
      if (!content && m.message?.conversation) content = m.message.conversation;
      if (!content && m.message?.extendedTextMessage?.text) content = m.message.extendedTextMessage.text;

      if (m.type === "image" || m.isMedia === true && m.mimetype?.startsWith("image")) {
        messageType = "image";
        mediaUrl = m.mediaUrl || m.url || null;
        if (!content) content = m.caption || null;
      } else if (m.type === "audio" || m.type === "ptt") {
        messageType = "audio";
        mediaUrl = m.mediaUrl || m.url || null;
      } else if (m.type === "video") {
        messageType = "video";
        mediaUrl = m.mediaUrl || m.url || null;
      } else if (m.type === "document") {
        messageType = "document";
        mediaUrl = m.mediaUrl || m.url || null;
        if (!content) content = m.fileName || null;
      } else if (m.type === "sticker") {
        messageType = "sticker";
      } else {
        messageType = m.type || "text";
      }

      if (m.fromMe === true) isFromMe = true;

      console.log("Parsed UaZapi format - phone:", phone, "fromMe:", isFromMe, "type:", messageType, "mediaUrl:", mediaUrl ? "yes" : "no");
    }
    // ===== Baileys/alternative format =====
    else {
      let msg: any = null;

      if (body.data?.key?.remoteJid) {
        msg = body.data;
      } else if (Array.isArray(body.data) && body.data.length > 0) {
        msg = body.data[0];
      } else if (body.key?.remoteJid) {
        msg = body;
      } else if (body.remoteJid || body.from) {
        phone = (body.remoteJid || body.from || "").replace("@s.whatsapp.net", "").replace("@g.us", "");
        isFromMe = body.fromMe === true;
        content = body.body || body.text || body.caption || body.content || null;
        uazapiMessageId = body.id || body.messageId || null;
        messageType = body.type || "text";
      }

      if (msg && !phone) {
        const remoteJid = msg.key?.remoteJid || msg.remoteJid || "";
        phone = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
        isFromMe = msg.key?.fromMe === true || msg.fromMe === true;
        uazapiMessageId = msg.key?.id || msg.id || null;

        const m = msg.message || msg;
        if (m.conversation) { content = m.conversation; messageType = "text"; }
        else if (m.extendedTextMessage?.text) { content = m.extendedTextMessage.text; messageType = "text"; }
        else if (m.imageMessage) { content = m.imageMessage.caption || null; mediaUrl = m.imageMessage.url || null; messageType = "image"; }
        else if (m.audioMessage) { mediaUrl = m.audioMessage.url || null; messageType = "audio"; }
        else if (m.videoMessage) { content = m.videoMessage.caption || null; mediaUrl = m.videoMessage.url || null; messageType = "video"; }
        else if (m.documentMessage) { content = m.documentMessage.fileName || null; mediaUrl = m.documentMessage.url || null; messageType = "document"; }
        else if (m.stickerMessage) { messageType = "sticker"; }
        else if (m.body || m.text) { content = m.body || m.text; messageType = "text"; }
        else { content = JSON.stringify(m).slice(0, 200); messageType = "unknown"; }
      }
    }

    if (!phone) {
      console.log("No phone extracted from webhook payload, ignoring");
      return new Response(JSON.stringify({ status: "ignored", reason: "no phone" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (phone.includes("-")) {
      console.log("Group message, ignoring");
      return new Response(JSON.stringify({ status: "ignored", reason: "group message" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isFromMe) {
      console.log("Outbound message from webhook, ignoring (already tracked)");
      return new Response(JSON.stringify({ status: "ignored", reason: "outbound" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (uazapiMessageId) {
      const { data: existing } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("uazapi_message_id", uazapiMessageId)
        .maybeSingle();

      if (existing) {
        console.log("Duplicate message, ignoring:", uazapiMessageId);
        return new Response(JSON.stringify({ status: "ignored", reason: "duplicate" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Find matching lead
    const cleanPhone = phone.replace(/\D/g, "");
    const phoneVariants = [cleanPhone];
    if (cleanPhone.startsWith("55")) {
      phoneVariants.push(cleanPhone.slice(2));
    } else {
      phoneVariants.push(`55${cleanPhone}`);
    }

    let leadId: string | null = null;
    let userId: string | null = null;

    const { data: leads } = await supabase
      .from("leads")
      .select("id, user_id, phone")
      .limit(1000);

    if (leads) {
      for (const lead of leads) {
        const leadClean = lead.phone.replace(/\D/g, "");
        const leadNormalized = leadClean.startsWith("55") ? leadClean : `55${leadClean}`;
        if (phoneVariants.includes(leadClean) || phoneVariants.includes(leadNormalized)) {
          leadId = lead.id;
          userId = lead.user_id;
          break;
        }
      }
    }

    if (!userId) {
      const { data: prevMsg } = await supabase
        .from("whatsapp_messages")
        .select("user_id")
        .eq("phone", cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevMsg) {
        userId = prevMsg.user_id;
      }
    }

    if (!userId) {
      console.log("No matching user found for phone:", phone);
      return new Response(JSON.stringify({ status: "ignored", reason: "no matching user" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    // === STEP 1: Save message immediately (for realtime) ===
    const { data: savedMsg, error: insertError } = await supabase
      .from("whatsapp_messages")
      .insert({
        user_id: userId,
        lead_id: leadId,
        phone: normalizedPhone,
        direction: "inbound",
        message_type: messageType,
        content: content,
        media_url: mediaUrl,
        uazapi_message_id: uazapiMessageId,
        status: "received",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("DB insert error:", JSON.stringify(insertError));
      throw new Error(`Failed to save message: ${insertError.message}`);
    }

    const messageId = savedMsg?.id;

    // === STEP 2: If audio, transcribe and update ===
    if ((messageType === "audio" || messageType === "ptt") && mediaUrl) {
      console.log("Audio message detected, starting transcription...");
      
      const transcription = await transcribeAudio(mediaUrl);
      
      if (transcription && messageId) {
        // Update message with transcription
        const { error: updateError } = await supabase
          .from("whatsapp_messages")
          .update({ content: `🎤 ${transcription}` })
          .eq("id", messageId);

        if (updateError) {
          console.error("Failed to update transcription:", updateError);
        } else {
          console.log("Transcription saved for message:", messageId);
          // Update content for interaction log below
          content = `🎤 ${transcription}`;
        }
      }
    }

    // Update lead last_contact_at
    if (leadId) {
      await supabase
        .from("leads")
        .update({ last_contact_at: new Date().toISOString() })
        .eq("id", leadId);
    }

    // Log interaction
    if (leadId && userId) {
      await supabase.from("interactions").insert({
        lead_id: leadId,
        user_id: userId,
        type: "whatsapp_received",
        description: `Mensagem recebida via WhatsApp: ${(content || "[Mídia]").slice(0, 100)}`,
      });
    }

    console.log("Inbound message saved successfully for phone:", normalizedPhone, "type:", messageType);

    return new Response(
      JSON.stringify({ status: "ok", saved: true, lead_id: leadId, transcribed: messageType === "audio" || messageType === "ptt" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
