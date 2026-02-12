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

  // Accept GET for webhook verification (some providers send GET to verify URL)
  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "ok", message: "Webhook is active" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body).slice(0, 500));

    // UaZapi sends different event types - we care about received messages
    // Common UaZapi webhook payload structures:
    // { event: "messages.upsert", data: { ... } }
    // or direct message object with: { key: { remoteJid, fromMe, id }, message: { ... }, ... }

    let phone: string | null = null;
    let content: string | null = null;
    let messageType = "text";
    let mediaUrl: string | null = null;
    let uazapiMessageId: string | null = null;
    let isFromMe = false;

    // Handle UaZapi V2 webhook format
    if (body.event === "messages.upsert" && body.data) {
      const msg = body.data;
      const remoteJid = msg.key?.remoteJid || "";
      phone = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
      isFromMe = msg.key?.fromMe === true;
      uazapiMessageId = msg.key?.id || null;

      // Extract content based on message type
      if (msg.message?.conversation) {
        content = msg.message.conversation;
        messageType = "text";
      } else if (msg.message?.extendedTextMessage?.text) {
        content = msg.message.extendedTextMessage.text;
        messageType = "text";
      } else if (msg.message?.imageMessage) {
        content = msg.message.imageMessage.caption || null;
        mediaUrl = msg.message.imageMessage.url || null;
        messageType = "image";
      } else if (msg.message?.audioMessage) {
        content = null;
        mediaUrl = msg.message.audioMessage.url || null;
        messageType = "audio";
      } else if (msg.message?.videoMessage) {
        content = msg.message.videoMessage.caption || null;
        mediaUrl = msg.message.videoMessage.url || null;
        messageType = "video";
      } else if (msg.message?.documentMessage) {
        content = msg.message.documentMessage.fileName || null;
        mediaUrl = msg.message.documentMessage.url || null;
        messageType = "document";
      } else if (msg.message?.stickerMessage) {
        content = null;
        messageType = "sticker";
      } else {
        content = JSON.stringify(msg.message || {}).slice(0, 200);
        messageType = "unknown";
      }
    }
    // Alternative: direct message format
    else if (body.key?.remoteJid) {
      const remoteJid = body.key.remoteJid;
      phone = remoteJid.replace("@s.whatsapp.net", "").replace("@g.us", "");
      isFromMe = body.key.fromMe === true;
      uazapiMessageId = body.key.id || null;

      if (body.message?.conversation) {
        content = body.message.conversation;
      } else if (body.message?.extendedTextMessage?.text) {
        content = body.message.extendedTextMessage.text;
      } else {
        content = JSON.stringify(body.message || {}).slice(0, 200);
      }
    }

    if (!phone) {
      console.log("No phone extracted from webhook payload, ignoring");
      return new Response(JSON.stringify({ status: "ignored", reason: "no phone" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip group messages
    if (phone.includes("-")) {
      console.log("Group message, ignoring");
      return new Response(JSON.stringify({ status: "ignored", reason: "group message" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Skip outbound messages (already saved by send-whatsapp)
    if (isFromMe) {
      console.log("Outbound message from webhook, ignoring (already tracked)");
      return new Response(JSON.stringify({ status: "ignored", reason: "outbound" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for duplicate message
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

    // Find matching lead by phone number
    const cleanPhone = phone.replace(/\D/g, "");
    const phoneVariants = [cleanPhone];
    if (cleanPhone.startsWith("55")) {
      phoneVariants.push(cleanPhone.slice(2));
    } else {
      phoneVariants.push(`55${cleanPhone}`);
    }

    let leadId: string | null = null;
    let userId: string | null = null;

    // Search for lead matching this phone
    const { data: leads } = await supabase
      .from("leads")
      .select("id, user_id, phone")
      .limit(100);

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

    // If no lead found, try to find any user that has sent messages to this phone
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

    // Normalize phone for storage
    const normalizedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    // Save inbound message
    const { error: insertError } = await supabase.from("whatsapp_messages").insert({
      user_id: userId,
      lead_id: leadId,
      phone: normalizedPhone,
      direction: "inbound",
      message_type: messageType,
      content: content,
      media_url: mediaUrl,
      uazapi_message_id: uazapiMessageId,
      status: "received",
    });

    if (insertError) {
      console.error("DB insert error:", JSON.stringify(insertError));
      throw new Error(`Failed to save message: ${insertError.message}`);
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

    console.log("Inbound message saved successfully for phone:", normalizedPhone);

    return new Response(
      JSON.stringify({ status: "ok", saved: true, lead_id: leadId }),
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
