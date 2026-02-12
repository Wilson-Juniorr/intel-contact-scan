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
    // STEP 1: Get ALL contacts and their names
    // =============================================
    console.log("=== STEP 1: Discovering contacts ===");
    
    const contactMap = new Map<string, string>(); // normalizedPhone -> name

    // Try all contact endpoints
    const endpoints = [
      { url: "/chat/list", method: "GET" },
      { url: "/contacts", method: "GET" },
      { url: "/contact/list", method: "GET" },
    ];

    for (const ep of endpoints) {
      try {
        const resp = await fetch(`${baseUrl}${ep.url}`, { method: ep.method, headers: h });
        if (!resp.ok) continue;
        const data = await resp.json();
        const items = Array.isArray(data) ? data : (data.chats || data.contacts || data.data || data.list || []);
        console.log(`${ep.url}: ${items.length} items`);
        
        for (const item of items) {
          const jid = item.wa_chatid || item.jid || item.id || "";
          if (jid.includes("@g.us") || jid.includes("broadcast") || jid.includes("status")) continue;
          
          const phone = extractPhone(jid || item.phone || "");
          if (!phone || phone.length < 10) continue;
          
          const normalized = normalizePhone(phone);
          
          // Extract name from ALL possible fields
          const name = item.wa_contactName || item.contact_name || item.name || 
                       item.wa_name || item.pushName || item.notify || 
                       item.lead_name || item.lead_fullName || "";
          
          if (name && name.trim() && name.trim() !== "." && !contactMap.has(normalized)) {
            contactMap.set(normalized, name.trim());
          }
        }
      } catch (e) {
        console.error(`${ep.url} error:`, e);
      }
    }

    console.log(`Contact names found: ${contactMap.size}`);

    // =============================================
    // STEP 2: Load existing DB message IDs
    // =============================================
    console.log("=== STEP 2: Loading existing IDs ===");

    const { data: leads } = await supabase.from("leads").select("id, phone, name");
    
    // Add lead names to contact map
    if (leads) {
      for (const lead of leads) {
        const leadNorm = normalizePhone(lead.phone.replace(/\D/g, ""));
        if (!contactMap.has(leadNorm) && lead.name) {
          contactMap.set(leadNorm, lead.name);
        }
      }
    }

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
    console.log(`Existing IDs in DB: ${existingIds.size}`);

    // =============================================
    // STEP 3: Fetch ALL messages globally (paginated)
    // The /message/find endpoint returns ALL messages regardless of phone filter.
    // So we fetch once globally with large pagination.
    // =============================================
    console.log("=== STEP 3: Fetching ALL messages globally ===");

    const messagesToInsert: any[] = [];
    let totalFetched = 0;
    let totalSkipped = 0;
    const conversationPhones = new Set<string>();
    const seenIds = new Set<string>(); // Track IDs within this run to avoid dupes

    let offset = 0;
    const batchSize = 500;
    let consecutiveEmpty = 0;

    while (true) {
      try {
        // Fetch without phone filter to get ALL messages
        const msgResp = await fetch(`${baseUrl}/message/find`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({ count: batchSize, offset }),
        });

        if (!msgResp.ok) {
          console.error(`/message/find HTTP ${msgResp.status} at offset ${offset}`);
          break;
        }

        const msgData = await msgResp.json();
        const messages = Array.isArray(msgData) ? msgData : (msgData.messages || msgData.data || []);

        if (messages.length === 0) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 2) break;
          offset += batchSize;
          continue;
        }
        consecutiveEmpty = 0;
        totalFetched += messages.length;

        for (const msg of messages) {
          const msgId = msg.messageid || msg.id || msg.key?.id || null;
          const fullId = msg.id || (msg.owner && msgId ? `${msg.owner}:${msgId}` : msgId);

          // Skip if already in DB or already seen in this run
          if (fullId && (existingIds.has(fullId) || seenIds.has(fullId))) {
            totalSkipped++;
            continue;
          }

          const chatId = msg.chatid || msg.chat || "";
          if (chatId.includes("@g.us") || chatId.includes("broadcast")) continue;
          
          const msgPhone = extractPhone(chatId);
          if (!msgPhone || msgPhone.length < 10) continue;

          const normalizedMsgPhone = normalizePhone(msgPhone);
          const isFromMe = msg.fromMe === true;

          // Content
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

          // Capture pushName as contact name if we don't have one
          if (!contactMap.has(normalizedMsgPhone)) {
            const pName = msg.pushName || msg.notifyName || msg.notify || "";
            if (pName && pName.trim() && pName.trim() !== ".") {
              contactMap.set(normalizedMsgPhone, pName.trim());
            }
          }

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

          if (fullId) {
            existingIds.add(fullId);
            seenIds.add(fullId);
          }
          conversationPhones.add(normalizedMsgPhone);
        }

        offset += batchSize;

        // Safety: don't run forever (max ~50k messages)
        if (offset > 50000) {
          console.log("Safety limit reached at offset 50000");
          break;
        }

        if (messages.length < batchSize) break;
      } catch (e) {
        console.error(`Error at offset ${offset}:`, e);
        break;
      }
    }

    console.log(`Total fetched: ${totalFetched}, new: ${messagesToInsert.length}, skipped: ${totalSkipped}`);

    // =============================================
    // STEP 4: Batch insert new messages
    // =============================================
    console.log("=== STEP 4: Inserting ===");
    
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
    // STEP 5: Backfill contact names on ALL messages missing them
    // =============================================
    console.log("=== STEP 5: Backfilling names ===");
    
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

    console.log(`=== DONE: ${insertedCount} imported, ${totalSkipped} skipped, ${namesUpdated} names updated ===`);

    return new Response(
      JSON.stringify({
        success: true,
        totalContacts: contactMap.size,
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
