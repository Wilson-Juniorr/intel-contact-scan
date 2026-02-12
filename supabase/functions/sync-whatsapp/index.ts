import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractPhone(raw: string): string {
  return raw.replace("@s.whatsapp.net", "").replace("@g.us", "").replace(/\D/g, "");
}

function normalizePhone(phone: string): string {
  return phone.startsWith("55") ? phone : `55${phone}`;
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
    // STEP 1: Discover ALL contacts from multiple sources
    // =============================================
    console.log("=== STEP 1: Discovering contacts ===");
    
    const contactMap = new Map<string, string>(); // normalizedPhone -> name
    const allPhones = new Set<string>();

    // Source 1: /chat/list (most reliable - shows all chats with messages)
    try {
      const resp = await fetch(`${baseUrl}/chat/list`, { method: "GET", headers: h });
      if (resp.ok) {
        const data = await resp.json();
        const chats = Array.isArray(data) ? data : (data.chats || data.data || data.list || []);
        console.log(`/chat/list: ${chats.length} chats`);
        
        for (const chat of chats) {
          const jid = chat.wa_chatid || chat.id || chat.jid || "";
          if (jid.includes("@g.us") || jid.includes("broadcast") || jid.includes("status")) continue;
          
          const phone = extractPhone(jid || chat.phone || "");
          if (!phone || phone.length < 10) continue;
          
          const normalized = normalizePhone(phone);
          allPhones.add(normalized);
          
          // Try every possible name field
          const name = chat.wa_contactName || chat.wa_name || chat.name || 
                       chat.pushName || chat.notify || chat.lead_name || 
                       chat.lead_fullName || chat.contact_name || "";
          
          if (name && name.trim() && name.trim() !== "." && !contactMap.has(normalized)) {
            contactMap.set(normalized, name.trim());
          }
        }
      }
    } catch (e) {
      console.error("chat/list error:", e);
    }

    // Source 2: /contacts (may have saved contact names)
    try {
      const resp = await fetch(`${baseUrl}/contacts`, { method: "GET", headers: h });
      if (resp.ok) {
        const data = await resp.json();
        const contacts = Array.isArray(data) ? data : (data.contacts || data.data || data.list || []);
        console.log(`/contacts: ${contacts.length} contacts`);
        
        for (const c of contacts) {
          const jid = c.jid || c.id || c.wa_chatid || "";
          if (jid.includes("@g.us") || jid.includes("broadcast")) continue;
          
          const phone = extractPhone(jid || c.phone || "");
          if (!phone || phone.length < 10) continue;
          
          const normalized = normalizePhone(phone);
          allPhones.add(normalized);
          
          const name = c.contact_name || c.name || c.pushName || c.notify || 
                       c.wa_name || c.wa_contactName || c.lead_name || "";
          
          if (name && name.trim() && name.trim() !== "." && !contactMap.has(normalized)) {
            contactMap.set(normalized, name.trim());
          }
        }
      }
    } catch (e) {
      console.error("/contacts error:", e);
    }

    // Source 3: /contact/list 
    try {
      const resp = await fetch(`${baseUrl}/contact/list`, { method: "GET", headers: h });
      if (resp.ok) {
        const data = await resp.json();
        const contacts = Array.isArray(data) ? data : (data.contacts || data.data || data.list || []);
        console.log(`/contact/list: ${contacts.length} contacts`);
        
        for (const c of contacts) {
          const jid = c.jid || c.id || c.wa_chatid || "";
          if (jid.includes("@g.us") || jid.includes("broadcast")) continue;
          
          const phone = extractPhone(jid || c.phone || "");
          if (!phone || phone.length < 10) continue;
          
          const normalized = normalizePhone(phone);
          allPhones.add(normalized);
          
          const name = c.contact_name || c.name || c.pushName || c.notify || 
                       c.wa_name || c.wa_contactName || "";
          
          if (name && name.trim() && name.trim() !== "." && !contactMap.has(normalized)) {
            contactMap.set(normalized, name.trim());
          }
        }
      }
    } catch (e) {
      console.error("/contact/list error:", e);
    }

    console.log(`Total phones discovered: ${allPhones.size}, with names: ${contactMap.size}`);

    // =============================================
    // STEP 2: For contacts without names, try /contact/find individually
    // =============================================
    console.log("=== STEP 2: Looking up individual contact names ===");
    
    let namesFound = 0;
    for (const phone of allPhones) {
      if (contactMap.has(phone)) continue;
      
      try {
        const resp = await fetch(`${baseUrl}/contact/find`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({ phone: `${phone}@s.whatsapp.net` }),
        });
        if (resp.ok) {
          const data = await resp.json();
          const name = data.contact_name || data.name || data.pushName || 
                       data.notify || data.wa_name || data.wa_contactName || "";
          if (name && name.trim() && name.trim() !== ".") {
            contactMap.set(phone, name.trim());
            namesFound++;
          }
        }
      } catch (_) { /* skip */ }
    }
    console.log(`Individual lookups found ${namesFound} more names. Total named: ${contactMap.size}`);

    // =============================================
    // STEP 3: Load existing DB data
    // =============================================
    console.log("=== STEP 3: Loading existing DB data ===");

    const { data: leads } = await supabase.from("leads").select("id, phone, name");
    
    // Add lead names to contact map
    if (leads) {
      for (const lead of leads) {
        const leadClean = lead.phone.replace(/\D/g, "");
        const leadNorm = normalizePhone(leadClean);
        if (!contactMap.has(leadNorm) && lead.name) {
          contactMap.set(leadNorm, lead.name);
        }
      }
    }

    // Load ALL existing uazapi_message_ids in batches
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
    // STEP 4: Fetch ALL messages per contact
    // =============================================
    console.log("=== STEP 4: Fetching messages per contact ===");

    const messagesToInsert: any[] = [];
    let totalFetched = 0;
    let totalSkipped = 0;
    const conversationPhones = new Set<string>();

    const phonesToFetch = Array.from(allPhones);
    console.log(`Fetching messages for ${phonesToFetch.length} contacts`);

    for (const contactPhone of phonesToFetch) {
      let phoneOffset = 0;
      const batchSize = 200; // Larger batches for efficiency

      while (true) {
        try {
          const msgResp = await fetch(`${baseUrl}/message/find`, {
            method: "POST",
            headers: h,
            body: JSON.stringify({
              phone: `${contactPhone}@s.whatsapp.net`,
              count: batchSize,
              offset: phoneOffset,
            }),
          });

          if (!msgResp.ok) break;

          const msgData = await msgResp.json();
          const messages = Array.isArray(msgData) ? msgData : (msgData.messages || msgData.data || []);

          if (messages.length === 0) break;

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
            
            // Get name from contact map, then from message fields
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
            
            // Also capture pushName as contact name if we don't have one
            if (!contactMap.has(normalizedMsgPhone)) {
              const pName = msg.pushName || msg.notifyName || msg.notify || "";
              if (pName && pName.trim() && pName.trim() !== ".") {
                contactMap.set(normalizedMsgPhone, pName.trim());
              }
            }
          }

          totalFetched += messages.length;
          phoneOffset += batchSize;

          if (messages.length < batchSize) break;
        } catch (e) {
          console.error(`Error for ${contactPhone}:`, e);
          break;
        }
      }
    }

    console.log(`Total fetched: ${totalFetched}, new: ${messagesToInsert.length}, skipped: ${totalSkipped}`);

    // =============================================
    // STEP 5: Batch insert new messages
    // =============================================
    console.log("=== STEP 5: Inserting ===");
    
    let insertedCount = 0;
    for (let i = 0; i < messagesToInsert.length; i += 200) {
      const chunk = messagesToInsert.slice(i, i + 200);
      const { error } = await supabase.from("whatsapp_messages").insert(chunk);
      if (error) {
        console.error(`Insert error chunk ${i}:`, error.message);
      } else {
        insertedCount += chunk.length;
      }
    }

    // =============================================
    // STEP 6: Backfill contact names on ALL existing messages
    // =============================================
    console.log("=== STEP 6: Backfilling names ===");
    
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

    console.log(`=== DONE: ${insertedCount} imported, ${totalSkipped} skipped, ${namesUpdated} names updated, ${conversationPhones.size} conversations ===`);

    return new Response(
      JSON.stringify({
        success: true,
        totalContacts: allPhones.size,
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
