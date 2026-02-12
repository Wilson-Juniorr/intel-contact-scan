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
    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
    if (!UAZAPI_URL || !UAZAPI_TOKEN) throw new Error("UaZapi credentials not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const baseUrl = UAZAPI_URL.replace(/\/+$/, "");
    const h = { "Content-Type": "application/json", token: UAZAPI_TOKEN };

    // Step 1: Get all contacts via GET /contacts
    console.log("=== SYNC: Fetching contacts ===");
    const contactsResp = await fetch(`${baseUrl}/contacts`, { method: "GET", headers: h });
    
    let contacts: any[] = [];
    if (contactsResp.ok) {
      const contactsData = await contactsResp.json();
      contacts = Array.isArray(contactsData) ? contactsData : (contactsData.contacts || contactsData.data || []);
      console.log(`Fetched ${contacts.length} contacts`);
    } else {
      console.error("Failed to fetch contacts:", contactsResp.status);
    }

    // Step 2: Fetch messages via POST /message/find with pagination
    console.log("=== SYNC: Fetching messages ===");
    
    let allMessages: any[] = [];
    let hasMore = true;
    let offset = 0;
    const limit = 100;
    
    while (hasMore && offset < 10000) { // Safety limit: max 10000 messages
      const msgResp = await fetch(`${baseUrl}/message/find`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ 
          phone: "", // empty = all conversations
          count: limit,
          offset: offset,
        }),
      });

      if (!msgResp.ok) {
        console.error(`/message/find returned ${msgResp.status}`);
        break;
      }

      const msgData = await msgResp.json();
      const messages = msgData.messages || msgData.data || [];
      hasMore = msgData.hasMore === true;
      
      console.log(`Offset ${offset}: got ${messages.length} messages, hasMore: ${hasMore}`);
      allMessages = [...allMessages, ...messages];
      offset += limit;
      
      if (messages.length === 0) break;
    }

    console.log(`Total messages fetched: ${allMessages.length}`);

    // Get existing leads for matching
    const { data: leads } = await supabase.from("leads").select("id, phone, name");
    
    // Get existing uazapi message IDs to avoid duplicates
    const { data: existingMsgs } = await supabase
      .from("whatsapp_messages")
      .select("uazapi_message_id")
      .not("uazapi_message_id", "is", null);
    
    const existingIds = new Set((existingMsgs || []).map(m => m.uazapi_message_id));

    // Build contact name map from UaZapi contacts
    const contactMap = new Map<string, string>();
    for (const c of contacts) {
      const jid = c.jid || c.id || "";
      const phone = jid.replace("@s.whatsapp.net", "").replace(/\D/g, "");
      const name = c.contact_name || c.name || c.pushName || c.notify || "";
      if (phone && name) contactMap.set(phone, name);
    }

    let totalImported = 0;
    let totalSkipped = 0;
    const conversationPhones = new Set<string>();
    const messagesToInsert: any[] = [];

    for (const msg of allMessages) {
      const msgId = msg.messageid || msg.id || msg.key?.id || null;
      const fullId = msg.id || (msg.owner && msgId ? `${msg.owner}:${msgId}` : msgId);
      
      // Skip duplicates
      if (fullId && existingIds.has(fullId)) {
        totalSkipped++;
        continue;
      }

      // Extract phone from chatid
      const chatId = msg.chatid || msg.chat || "";
      const phone = chatId.replace("@s.whatsapp.net", "").replace("@g.us", "").replace(/\D/g, "");
      
      // Skip groups and invalid
      if (chatId.includes("@g.us") || !phone || phone.length < 10) continue;
      
      const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;
      const isFromMe = msg.fromMe === true;
      
      // Extract content based on messageType
      let content: string | null = null;
      let messageType = "text";
      const msgType = (msg.messageType || "").toLowerCase();
      
      if (msg.content?.text) {
        content = msg.content.text;
      } else if (msg.content?.caption) {
        content = msg.content.caption;
      } else if (typeof msg.content === "string") {
        content = msg.content;
      }

      if (msgType.includes("image")) messageType = "image";
      else if (msgType.includes("audio") || msgType.includes("ptt")) messageType = "audio";
      else if (msgType.includes("video")) messageType = "video";
      else if (msgType.includes("document")) messageType = "document";
      else if (msgType.includes("sticker")) messageType = "sticker";
      else if (msgType.includes("conversation") || msgType.includes("text") || msgType.includes("extended")) messageType = "text";
      else messageType = "text";

      // Get timestamp
      const timestamp = msg.messageTimestamp || msg.timestamp;
      let createdAt: string;
      if (timestamp) {
        const ts = typeof timestamp === "number"
          ? (timestamp > 1e12 ? timestamp : timestamp * 1000)
          : new Date(timestamp).getTime();
        createdAt = new Date(ts).toISOString();
      } else {
        createdAt = new Date().toISOString();
      }

      // Match with lead
      let leadId: string | null = null;
      if (leads) {
        for (const lead of leads) {
          const leadClean = lead.phone.replace(/\D/g, "");
          const leadNormalized = leadClean.startsWith("55") ? leadClean : `55${leadClean}`;
          if (leadNormalized === normalizedPhone || leadClean === phone) {
            leadId = lead.id;
            break;
          }
        }
      }

      const mediaUrl = msg.fileURL || msg.mediaUrl || null;

      // Get contact name from UaZapi contacts
      const contactName = contactMap.get(phone) || contactMap.get(normalizedPhone) || null;

      messagesToInsert.push({
        user_id: userId,
        lead_id: leadId,
        phone: normalizedPhone,
        direction: isFromMe ? "outbound" : "inbound",
        message_type: messageType,
        content: content,
        media_url: mediaUrl || null,
        uazapi_message_id: fullId,
        status: isFromMe ? "sent" : "received",
        created_at: createdAt,
        contact_name: contactName,
      });

      if (fullId) existingIds.add(fullId);
      conversationPhones.add(normalizedPhone);
    }

    // Batch insert in chunks of 100
    let insertedCount = 0;
    for (let i = 0; i < messagesToInsert.length; i += 100) {
      const chunk = messagesToInsert.slice(i, i + 100);
      const { error: insertError } = await supabase
        .from("whatsapp_messages")
        .insert(chunk);

      if (insertError) {
        console.error(`Insert error at chunk ${i}:`, insertError.message);
      } else {
        insertedCount += chunk.length;
      }
    }

    totalImported = insertedCount;

    console.log(`=== SYNC COMPLETE: ${totalImported} imported, ${totalSkipped} duplicates skipped, ${conversationPhones.size} conversations ===`);

    return new Response(
      JSON.stringify({
        success: true,
        totalContacts: contacts.length,
        totalMessagesFetched: allMessages.length,
        totalImported,
        totalSkipped,
        conversations: conversationPhones.size,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
