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

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const baseUrl = UAZAPI_URL.replace(/\/+$/, "");
    const h = { "Content-Type": "application/json", token: UAZAPI_TOKEN };

    // Step 1: Get all contacts
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

    // Build contact name map + phone list
    const contactMap = new Map<string, string>();
    const contactPhones: string[] = [];
    for (const c of contacts) {
      const jid = c.jid || c.id || "";
      const phone = jid.replace("@s.whatsapp.net", "").replace(/\D/g, "");
      const name = c.contact_name || c.name || c.pushName || c.notify || "";
      if (phone && phone.length >= 10) {
        if (name) contactMap.set(phone, name);
        contactPhones.push(phone);
      }
    }
    console.log(`Contact map has ${contactMap.size} names, ${contactPhones.length} phones`);

    // Get existing leads for matching
    const { data: leads } = await supabase.from("leads").select("id, phone, name");
    
    // Get ALL existing uazapi message IDs to avoid duplicates
    const existingIds = new Set<string>();
    let offset = 0;
    while (true) {
      const { data: batch } = await supabase
        .from("whatsapp_messages")
        .select("uazapi_message_id")
        .not("uazapi_message_id", "is", null)
        .range(offset, offset + 999);
      if (!batch || batch.length === 0) break;
      batch.forEach(m => existingIds.add(m.uazapi_message_id!));
      if (batch.length < 1000) break;
      offset += 1000;
    }
    console.log(`Existing messages in DB: ${existingIds.size}`);

    // Step 2: Fetch messages PER CONTACT to get complete history
    console.log("=== SYNC: Fetching messages per contact ===");
    
    let totalFetched = 0;
    let totalImported = 0;
    let totalSkipped = 0;
    const conversationPhones = new Set<string>();
    const messagesToInsert: any[] = [];

    // Also fetch with empty phone to catch any conversations not in contacts
    const phonesToFetch = [...new Set([...contactPhones, ""])];

    for (const fetchPhone of phonesToFetch) {
      let phoneOffset = 0;
      const limit = 100;
      let phoneMessages = 0;

      while (phoneOffset < 50000) {
        try {
          const msgResp = await fetch(`${baseUrl}/message/find`, {
            method: "POST",
            headers: h,
            body: JSON.stringify({ 
              phone: fetchPhone ? `${fetchPhone}@s.whatsapp.net` : "",
              count: limit,
              offset: phoneOffset,
            }),
          });

          if (!msgResp.ok) {
            console.error(`/message/find for ${fetchPhone || 'all'} returned ${msgResp.status}`);
            break;
          }

          const msgData = await msgResp.json();
          const messages = Array.isArray(msgData) ? msgData : (msgData.messages || msgData.data || []);
          
          if (messages.length === 0) break;

          phoneMessages += messages.length;

          for (const msg of messages) {
            const msgId = msg.messageid || msg.id || msg.key?.id || null;
            const fullId = msg.id || (msg.owner && msgId ? `${msg.owner}:${msgId}` : msgId);
            
            if (fullId && existingIds.has(fullId)) {
              totalSkipped++;
              continue;
            }

            const chatId = msg.chatid || msg.chat || "";
            const phone = chatId.replace("@s.whatsapp.net", "").replace("@g.us", "").replace(/\D/g, "");
            
            if (chatId.includes("@g.us") || !phone || phone.length < 10) continue;
            
            const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;
            const isFromMe = msg.fromMe === true;
            
            let content: string | null = null;
            let messageType = "text";
            const msgType = (msg.messageType || "").toLowerCase();
            
            if (msg.content?.text) content = msg.content.text;
            else if (msg.content?.caption) content = msg.content.caption;
            else if (typeof msg.content === "string") content = msg.content;

            if (msgType.includes("image")) messageType = "image";
            else if (msgType.includes("audio") || msgType.includes("ptt")) messageType = "audio";
            else if (msgType.includes("video")) messageType = "video";
            else if (msgType.includes("document")) messageType = "document";
            else if (msgType.includes("sticker")) messageType = "sticker";
            else messageType = "text";

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
            const contactName = contactMap.get(phone) || contactMap.get(normalizedPhone) || 
                               msg.pushName || msg.notifyName || null;

            messagesToInsert.push({
              user_id: userId,
              lead_id: leadId,
              phone: normalizedPhone,
              direction: isFromMe ? "outbound" : "inbound",
              message_type: messageType,
              content,
              media_url: mediaUrl || null,
              uazapi_message_id: fullId,
              status: isFromMe ? "sent" : "received",
              created_at: createdAt,
              contact_name: contactName,
            });

            if (fullId) existingIds.add(fullId);
            conversationPhones.add(normalizedPhone);
          }

          totalFetched += messages.length;
          phoneOffset += limit;

          if (messages.length < limit) break;
          if (msgData.hasMore === false) break;
        } catch (e) {
          console.error(`Error fetching messages for ${fetchPhone}:`, e);
          break;
        }
      }

      if (phoneMessages > 0 && fetchPhone) {
        console.log(`  ${fetchPhone}: ${phoneMessages} messages`);
      }
    }

    console.log(`Total messages fetched: ${totalFetched}`);

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

    // Step 3: Update existing messages that have null contact_name
    let namesUpdated = 0;
    for (const [phone, name] of contactMap) {
      const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;
      const { count } = await supabase
        .from("whatsapp_messages")
        .update({ contact_name: name })
        .is("contact_name", null)
        .eq("phone", normalizedPhone)
        .select("id", { count: "exact", head: true });
      if (count && count > 0) namesUpdated += count;
    }

    console.log(`=== SYNC COMPLETE: ${totalImported} imported, ${totalSkipped} duplicates skipped, ${conversationPhones.size} new conversations, ${namesUpdated} names updated ===`);

    return new Response(
      JSON.stringify({
        success: true,
        totalContacts: contacts.length,
        totalMessagesFetched: totalFetched,
        totalImported,
        totalSkipped,
        namesUpdated,
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
