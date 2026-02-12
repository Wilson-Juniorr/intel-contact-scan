import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface UazapiContact {
  jid?: string;
  id?: string;
  contact_name?: string;
  name?: string;
  pushName?: string;
  notify?: string;
  wa_name?: string;
  wa_contactName?: string;
  lead_name?: string;
  phone?: string;
}

function extractPhone(raw: string): string {
  const phone = raw.replace("@s.whatsapp.net", "").replace("@g.us", "").replace(/\D/g, "");
  return phone;
}

function normalizePhone(phone: string): string {
  return phone.startsWith("55") ? phone : `55${phone}`;
}

function extractContactName(c: UazapiContact): string {
  return c.contact_name || c.name || c.pushName || c.notify || c.wa_name || c.wa_contactName || c.lead_name || "";
}

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

    // =============================================
    // STEP 1: Fetch ALL contacts from UaZapi
    // =============================================
    console.log("=== SYNC STEP 1: Fetching contacts ===");
    
    const contactMap = new Map<string, string>(); // normalizedPhone -> name
    const allContactPhones = new Set<string>();

    // Try multiple endpoints to get contacts
    const contactEndpoints = ["/contacts", "/contact/list", "/chat/list"];
    
    for (const endpoint of contactEndpoints) {
      try {
        const resp = await fetch(`${baseUrl}${endpoint}`, { method: "GET", headers: h });
        if (!resp.ok) {
          console.log(`${endpoint} returned ${resp.status}, trying next...`);
          continue;
        }
        const data = await resp.json();
        const items = Array.isArray(data) ? data : (data.contacts || data.chats || data.data || data.list || []);
        
        console.log(`${endpoint}: got ${items.length} items`);
        
        for (const item of items) {
          const jid = item.jid || item.id || item.wa_chatid || item.chatid || "";
          if (jid.includes("@g.us") || jid.includes("broadcast")) continue;
          
          const phone = extractPhone(jid || item.phone || "");
          if (!phone || phone.length < 10) continue;
          
          const normalized = normalizePhone(phone);
          allContactPhones.add(normalized);
          
          // Extract name from all possible fields
          const name = item.contact_name || item.name || item.pushName || item.notify || 
                       item.wa_name || item.wa_contactName || item.lead_name || 
                       item.lead_fullName || "";
          
          if (name && name.trim() && !contactMap.has(normalized)) {
            contactMap.set(normalized, name.trim());
          }
        }
        
        if (items.length > 0) break; // Got contacts, no need for other endpoints
      } catch (e) {
        console.error(`Error fetching ${endpoint}:`, e);
      }
    }

    // Also try /chat/list to get names from chat metadata (wa_name field)
    try {
      const chatResp = await fetch(`${baseUrl}/chat/list`, { method: "GET", headers: h });
      if (chatResp.ok) {
        const chatData = await chatResp.json();
        const chats = Array.isArray(chatData) ? chatData : (chatData.chats || chatData.data || []);
        console.log(`/chat/list: got ${chats.length} chats`);
        
        for (const chat of chats) {
          const jid = chat.wa_chatid || chat.id || chat.jid || "";
          if (jid.includes("@g.us") || jid.includes("broadcast")) continue;
          
          const phone = extractPhone(jid || chat.phone || "");
          if (!phone || phone.length < 10) continue;
          
          const normalized = normalizePhone(phone);
          allContactPhones.add(normalized);
          
          const name = chat.wa_name || chat.wa_contactName || chat.name || 
                       chat.lead_name || chat.lead_fullName || chat.pushName || chat.notify || "";
          
          if (name && name.trim() && name !== "." && !contactMap.has(normalized)) {
            contactMap.set(normalized, name.trim());
          }
        }
      }
    } catch (e) {
      console.log("chat/list not available:", e);
    }

    console.log(`Contact map: ${contactMap.size} names, ${allContactPhones.size} phones total`);

    // =============================================
    // STEP 2: Get existing data from DB
    // =============================================
    console.log("=== SYNC STEP 2: Loading existing DB data ===");

    const { data: leads } = await supabase.from("leads").select("id, phone, name");
    
    // Load ALL existing uazapi_message_ids
    const existingIds = new Set<string>();
    let dbOffset = 0;
    while (true) {
      const { data: batch } = await supabase
        .from("whatsapp_messages")
        .select("uazapi_message_id")
        .not("uazapi_message_id", "is", null)
        .range(dbOffset, dbOffset + 999);
      if (!batch || batch.length === 0) break;
      batch.forEach(m => { if (m.uazapi_message_id) existingIds.add(m.uazapi_message_id); });
      if (batch.length < 1000) break;
      dbOffset += 1000;
    }
    console.log(`Existing message IDs in DB: ${existingIds.size}`);

    // =============================================
    // STEP 3: Fetch messages PER CONTACT (no global limit)
    // =============================================
    console.log("=== SYNC STEP 3: Fetching messages per contact ===");

    const messagesToInsert: any[] = [];
    let totalFetched = 0;
    let totalSkipped = 0;
    const conversationPhones = new Set<string>();
    const contactsFetched: string[] = [];

    // Convert to array for iteration
    const phonesToFetch = Array.from(allContactPhones);
    console.log(`Will fetch messages for ${phonesToFetch.length} contacts`);

    for (const contactPhone of phonesToFetch) {
      let phoneOffset = 0;
      const batchSize = 100;
      let phoneTotal = 0;
      let consecutiveEmpty = 0;

      // Strip 55 prefix for JID format if needed
      const rawPhone = contactPhone.startsWith("55") ? contactPhone.slice(2) : contactPhone;
      const jid = `${contactPhone}@s.whatsapp.net`;

      while (true) {
        try {
          const msgResp = await fetch(`${baseUrl}/message/find`, {
            method: "POST",
            headers: h,
            body: JSON.stringify({
              phone: jid,
              count: batchSize,
              offset: phoneOffset,
            }),
          });

          if (!msgResp.ok) {
            console.error(`  /message/find for ${contactPhone}: HTTP ${msgResp.status}`);
            break;
          }

          const msgData = await msgResp.json();
          const messages = Array.isArray(msgData) ? msgData : (msgData.messages || msgData.data || []);

          if (messages.length === 0) {
            consecutiveEmpty++;
            if (consecutiveEmpty >= 2) break;
            phoneOffset += batchSize;
            continue;
          }
          consecutiveEmpty = 0;
          phoneTotal += messages.length;

          for (const msg of messages) {
            const msgId = msg.messageid || msg.id || msg.key?.id || null;
            const fullId = msg.id || (msg.owner && msgId ? `${msg.owner}:${msgId}` : msgId);

            if (fullId && existingIds.has(fullId)) {
              totalSkipped++;
              continue;
            }

            const chatId = msg.chatid || msg.chat || "";
            const msgPhone = extractPhone(chatId);
            if (chatId.includes("@g.us") || !msgPhone || msgPhone.length < 10) continue;

            const normalizedMsgPhone = normalizePhone(msgPhone);
            const isFromMe = msg.fromMe === true;

            // Extract content
            let content: string | null = null;
            let messageType = "text";

            if (msg.content?.text) content = msg.content.text;
            else if (typeof msg.content === "string") content = msg.content;
            else if (msg.content?.caption) content = msg.content.caption;

            const rawType = (msg.messageType || msg.type || "").toLowerCase();
            if (rawType.includes("image")) messageType = "image";
            else if (rawType.includes("audio") || rawType.includes("ptt")) messageType = "audio";
            else if (rawType.includes("video")) messageType = "video";
            else if (rawType.includes("document")) messageType = "document";
            else if (rawType.includes("sticker")) messageType = "sticker";

            // Timestamp
            const ts = msg.messageTimestamp || msg.timestamp;
            let createdAt: string;
            if (ts) {
              const msTs = typeof ts === "number" ? (ts > 1e12 ? ts : ts * 1000) : new Date(ts).getTime();
              createdAt = new Date(msTs).toISOString();
            } else {
              createdAt = new Date().toISOString();
            }

            // Match lead
            let leadId: string | null = null;
            if (leads) {
              for (const lead of leads) {
                const leadClean = lead.phone.replace(/\D/g, "");
                const leadNorm = normalizePhone(leadClean);
                if (leadNorm === normalizedMsgPhone || leadClean === msgPhone) {
                  leadId = lead.id;
                  break;
                }
              }
            }

            const mediaUrl = msg.fileURL || msg.mediaUrl || null;
            const msgContactName = contactMap.get(normalizedMsgPhone) || 
                                   msg.pushName || msg.notifyName || msg.notify || null;

            messagesToInsert.push({
              user_id: userId,
              lead_id: leadId,
              phone: normalizedMsgPhone,
              direction: isFromMe ? "outbound" : "inbound",
              message_type: messageType,
              content,
              media_url: mediaUrl,
              uazapi_message_id: fullId,
              status: isFromMe ? "sent" : "received",
              created_at: createdAt,
              contact_name: msgContactName,
            });

            if (fullId) existingIds.add(fullId);
            conversationPhones.add(normalizedMsgPhone);
          }

          totalFetched += messages.length;
          phoneOffset += batchSize;

          if (messages.length < batchSize) break;
        } catch (e) {
          console.error(`  Error for ${contactPhone}:`, e);
          break;
        }
      }

      if (phoneTotal > 0) {
        contactsFetched.push(`${contactPhone}(${phoneTotal})`);
      }
    }

    console.log(`Contacts with messages: ${contactsFetched.join(", ")}`);
    console.log(`Total fetched: ${totalFetched}, new to insert: ${messagesToInsert.length}, skipped: ${totalSkipped}`);

    // =============================================
    // STEP 4: Batch insert new messages
    // =============================================
    console.log("=== SYNC STEP 4: Inserting new messages ===");
    
    let insertedCount = 0;
    for (let i = 0; i < messagesToInsert.length; i += 100) {
      const chunk = messagesToInsert.slice(i, i + 100);
      const { error } = await supabase.from("whatsapp_messages").insert(chunk);
      if (error) {
        console.error(`Insert error at chunk ${i}:`, error.message);
      } else {
        insertedCount += chunk.length;
      }
    }

    // =============================================
    // STEP 5: Update contact_name on ALL existing messages that are missing it
    // =============================================
    console.log("=== SYNC STEP 5: Backfilling contact names ===");
    
    let namesUpdated = 0;
    for (const [phone, name] of contactMap) {
      const { count } = await supabase
        .from("whatsapp_messages")
        .update({ contact_name: name })
        .is("contact_name", null)
        .eq("phone", phone)
        .select("id", { count: "exact", head: true });
      if (count && count > 0) namesUpdated += count;
    }

    // Also try with leads names for messages that still have no contact_name
    if (leads) {
      for (const lead of leads) {
        const leadClean = lead.phone.replace(/\D/g, "");
        const leadNorm = normalizePhone(leadClean);
        const { count } = await supabase
          .from("whatsapp_messages")
          .update({ contact_name: lead.name })
          .is("contact_name", null)
          .eq("phone", leadNorm)
          .select("id", { count: "exact", head: true });
        if (count && count > 0) namesUpdated += count;
      }
    }

    console.log(`=== SYNC COMPLETE: ${insertedCount} imported, ${totalSkipped} skipped, ${namesUpdated} names updated, ${conversationPhones.size} conversations ===`);

    return new Response(
      JSON.stringify({
        success: true,
        totalContacts: allContactPhones.size,
        contactsWithNames: contactMap.size,
        totalMessagesFetched: totalFetched,
        totalImported: insertedCount,
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
