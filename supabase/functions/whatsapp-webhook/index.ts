import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function downloadAudioFromUazapi(mediaInfo: any, messageId: string | null): Promise<{ base64: string; format: string } | null> {
  try {
    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
    if (!UAZAPI_URL || !UAZAPI_TOKEN) {
      console.error("UaZapi credentials not configured");
      return null;
    }

    const baseUrl = UAZAPI_URL.replace(/\/+$/, "");
    const postHeaders = { "Content-Type": "application/json", token: UAZAPI_TOKEN };
    const getHeaders = { token: UAZAPI_TOKEN };

    // Extract media decryption params
    const content = mediaInfo?.content || mediaInfo;
    const url = content?.URL || content?.url || content?.directPath;
    const mediaKey = content?.mediaKey || content?.MediaKey;
    const fileSHA256 = content?.fileSHA256 || content?.FileSHA256;
    const fileLength = content?.fileLength || content?.FileLength;
    const fileEncSHA256 = content?.fileEncSHA256 || content?.FileEncSHA256;
    const mimetype = content?.mimetype || content?.Mimetype || "audio/ogg; codecs=opus";

    // Extract chatId and full message ID for UaZapi V2
    const chatId = mediaInfo?.chatid || mediaInfo?.chatId || null;
    // The message ID format from UaZapi is "owner:messageId" - extract just the messageId part
    const rawMsgId = messageId || mediaInfo?.id || mediaInfo?.messageid || null;
    const shortMsgId = rawMsgId?.includes(":") ? rawMsgId.split(":").pop() : rawMsgId;

    console.log("Download attempt - msgId:", rawMsgId, "shortMsgId:", shortMsgId, "chatId:", chatId, "hasURL:", !!url, "hasMediaKey:", !!mediaKey);

    // === Strategy 1: UaZapi V2 - POST /message/download-media with messageId ===
    if (shortMsgId) {
      const msgIdBodies = [
        { MessageId: shortMsgId },
        { messageId: shortMsgId },
        { Id: shortMsgId },
        { id: shortMsgId },
        { MessageId: rawMsgId },
        ...(chatId ? [{ MessageId: shortMsgId, ChatId: chatId }, { messageId: shortMsgId, chatId }] : []),
      ];

      const s1Endpoints = [
        "/message/download-media",
        "/message/downloadMedia", 
        "/message/download",
        "/chat/downloadmedia",
        "/chat/downloadaudio",
        "/chat/getLink",
        "/message/getLink",
        "/media/download",
      ];

      for (const endpoint of s1Endpoints) {
        for (const body of msgIdBodies.slice(0, 2)) { // Only try first 2 body variants per endpoint
          try {
            console.log(`[S1] POST ${endpoint} body:`, JSON.stringify(body));
            const resp = await fetch(`${baseUrl}${endpoint}`, {
              method: "POST",
              headers: postHeaders,
              body: JSON.stringify(body),
            });
            const result = await tryExtractAudio(resp, `POST ${endpoint}`);
            if (result) return result;
          } catch (e) {
            console.log(`POST ${endpoint} error:`, e);
          }
        }
      }
    }

    // === Strategy 2: GET with messageId in query params ===
    if (shortMsgId) {
      const s2Endpoints = [
        `/message/download-media?messageId=${encodeURIComponent(shortMsgId)}`,
        `/message/downloadMedia?messageId=${encodeURIComponent(shortMsgId)}`,
        `/chat/getLink?messageId=${encodeURIComponent(shortMsgId)}`,
        `/message/getLink?messageId=${encodeURIComponent(shortMsgId)}`,
        `/media/${encodeURIComponent(shortMsgId)}`,
      ];

      for (const endpoint of s2Endpoints) {
        try {
          console.log(`[S2] GET ${endpoint}`);
          const resp = await fetch(`${baseUrl}${endpoint}`, {
            method: "GET",
            headers: getHeaders,
          });
          const result = await tryExtractAudio(resp, `GET ${endpoint}`);
          if (result) return result;
        } catch (e) {
          console.log(`GET ${endpoint} error:`, e);
        }
      }
    }

    // === Strategy 3: POST with decryption params (original wuzapi approach) ===
    if (url && mediaKey) {
      const downloadBody = {
        Url: url,
        MediaKey: mediaKey,
        Mimetype: mimetype,
        FileSHA256: fileSHA256,
        FileLength: fileLength || 0,
        FileEncSHA256: fileEncSHA256,
      };

      const s3Endpoints = ["/chat/downloadaudio", "/chat/downloadmedia"];
      for (const endpoint of s3Endpoints) {
        try {
          console.log(`[S3] POST ${endpoint} (decrypt params)`);
          const resp = await fetch(`${baseUrl}${endpoint}`, {
            method: "POST",
            headers: postHeaders,
            body: JSON.stringify(downloadBody),
          });
          const result = await tryExtractAudio(resp, `POST ${endpoint} (decrypt)`);
          if (result) return result;
        } catch (e) {
          console.log(`${endpoint} decrypt error:`, e);
        }
      }
    }

    // === Strategy 4: Fetch Swagger/API discovery to log available endpoints ===
    try {
      console.log("[S4] Fetching API spec to discover endpoints...");
      const specResp = await fetch(`${baseUrl}/api`, { headers: getHeaders });
      if (specResp.ok) {
        const specText = await specResp.text();
        console.log("API discovery response:", specText.slice(0, 500));
      } else {
        console.log("API discovery returned:", specResp.status);
      }
    } catch (e) {
      console.log("API discovery failed:", e);
    }

    console.error("All UaZapi download attempts failed");
    return null;
  } catch (error) {
    console.error("Audio download error:", error);
    return null;
  }
}

async function tryExtractAudio(resp: Response, endpoint: string): Promise<{ base64: string; format: string } | null> {
  if (!resp.ok) {
    console.log(`${endpoint} returned status ${resp.status}`);
    return null;
  }
  const contentType = resp.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await resp.json();
    const b64 = data.base64 || data.data || data.result || data.media;
    if (b64 && typeof b64 === "string" && b64.length > 100) {
      console.log(`Downloaded via ${endpoint}, base64 length: ${b64.length}`);
      const fmt = (data.mimetype || "").includes("mp3") ? "mp3" : "ogg";
      return { base64: b64, format: fmt };
    }
    console.log(`${endpoint} JSON response has no usable base64:`, JSON.stringify(data).slice(0, 200));
  } else {
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length > 500) {
      console.log(`Downloaded binary via ${endpoint}, size: ${bytes.length}`);
      return { base64: arrayBufferToBase64(bytes), format: "ogg" };
    }
    console.log(`${endpoint} binary response too small: ${bytes.length}`);
  }
  return null;
}

function arrayBufferToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

async function transcribeAudio(mediaInfo: any, messageId: string | null): Promise<string | null> {
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured, skipping transcription");
      return null;
    }

    // Download via UaZapi using message ID and media decryption params
    const audioData = await downloadAudioFromUazapi(mediaInfo, messageId);

    if (!audioData) {
      console.error("Could not download audio via UaZapi");
      return null;
    }

    console.log("Audio ready for transcription, format:", audioData.format);

    // Transcribe using Gemini via Lovable AI Gateway (multimodal data URI format)
    const mimeType = audioData.format === "mp3" ? "audio/mpeg" : "audio/ogg";
    const dataUri = `data:${mimeType};base64,${audioData.base64}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Transcreva este áudio de voz em português brasileiro com precisão. 
Retorne APENAS o texto transcrito, sem aspas, sem explicações, sem prefixos.
Se o áudio estiver inaudível, retorne "[Áudio não compreendido]".`,
              },
              {
                type: "image_url",
                image_url: {
                  url: dataUri,
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

      // Extract media URL from various UaZapi locations
      const extractedMediaUrl = m.mediaUrl || m.url || m.content?.URL || null;

      // Detect type - UaZapi can send "media" as generic type, so check chat metadata too
      const chatLastMsgType = (body.chat?.wa_lastMessageType || "").toLowerCase();
      const mimeType = (m.mimetype || m.content?.mimetype || "").toLowerCase();
      const isPtt = m.content?.PTT === true || m.type === "ptt" || chatLastMsgType === "audiomessage";

      if (m.type === "image" || chatLastMsgType === "imagemessage" || mimeType.startsWith("image")) {
        messageType = "image";
        mediaUrl = extractedMediaUrl;
        if (!content) content = m.caption || null;
      } else if (m.type === "audio" || m.type === "ptt" || isPtt || chatLastMsgType === "audiomessage" || mimeType.startsWith("audio")) {
        messageType = "audio";
        mediaUrl = extractedMediaUrl;
      } else if (m.type === "video" || chatLastMsgType === "videomessage" || mimeType.startsWith("video")) {
        messageType = "video";
        mediaUrl = extractedMediaUrl;
      } else if (m.type === "document" || chatLastMsgType === "documentmessage") {
        messageType = "document";
        mediaUrl = extractedMediaUrl;
        if (!content) content = m.fileName || null;
      } else if (m.type === "sticker" || chatLastMsgType === "stickermessage") {
        messageType = "sticker";
      } else if (m.type === "media" && extractedMediaUrl) {
        // Generic "media" - try to infer from mime or URL
        if (mimeType.startsWith("audio") || isPtt) {
          messageType = "audio";
        } else if (mimeType.startsWith("image")) {
          messageType = "image";
        } else if (mimeType.startsWith("video")) {
          messageType = "video";
        } else {
          messageType = "document";
        }
        mediaUrl = extractedMediaUrl;
      } else {
        messageType = m.type || "text";
        // Sanitize type to match constraint
        const validTypes = ["text", "audio", "ptt", "image", "document", "video", "sticker", "media", "unknown"];
        if (!validTypes.includes(messageType)) messageType = "unknown";
      }

      if (m.fromMe === true) isFromMe = true;

      console.log("Parsed UaZapi format - phone:", phone, "fromMe:", isFromMe, "type:", messageType, "mediaUrl:", mediaUrl ? mediaUrl.slice(0, 80) : "no");
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
    if ((messageType === "audio" || messageType === "ptt") && uazapiMessageId) {
      console.log("Audio message detected, starting transcription...");
      
      // Pass the message content object and message ID for UaZapi V2 download
      const messageContent = body?.message || null;
      const transcription = await transcribeAudio(messageContent, uazapiMessageId);
      
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
