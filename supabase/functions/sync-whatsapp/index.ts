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

interface ContactInfo {
  name: string | null;
  profilePicUrl: string | null;
}

async function downloadAudioFromUazapi(messageId: string): Promise<{ base64: string; format: string } | null> {
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
      const fmt = (data.mimetype || "").includes("mp3") ? "mp3" : "ogg";
      return { base64: b64, format: fmt };
    }
  } catch (e) { console.error("Audio download error:", e); }
  return null;
}

async function transcribeAudio(messageId: string): Promise<string | null> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) return null;

  const audioData = await downloadAudioFromUazapi(messageId);
  if (!audioData) return null;

  const mimeType = audioData.format === "mp3" ? "audio/mpeg" : "audio/ogg";
  const dataUri = `data:${mimeType};base64,${audioData.base64}`;

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash-lite",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Transcreva este áudio de voz em português brasileiro com precisão. Retorne APENAS o texto transcrito, sem aspas, sem explicações. Se inaudível, retorne '[Áudio não compreendido]'." },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        }],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) { console.error("Transcription error:", e); return null; }
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
    // STEP 1: Build complete contact map from ALL sources
    // =============================================
    console.log("=== STEP 1: Building contact map from all sources ===");
    const contactMap = new Map<string, ContactInfo>();

    // SOURCE 1: GET /contacts (57 contacts with saved names)
    try {
      const resp = await fetch(`${baseUrl}/contacts`, { method: "GET", headers: h });
      if (resp.ok) {
        const data = await resp.json();
        const items = Array.isArray(data) ? data : [];
        console.log(`GET /contacts: ${items.length} contacts`);
        for (const item of items) {
          const jid = item.jid || "";
          if (jid.includes("@g.us") || jid.includes("broadcast") || jid.includes("status")) continue;
          const phone = extractPhone(jid);
          if (!phone || phone.length < 10) continue;
          const normalized = normalizePhone(phone);
          const name = item.contact_name || item.contact_FirstName || item.name || "";
          const cleanName = name.trim() && name.trim() !== "." ? name.trim() : null;
          contactMap.set(normalized, { name: cleanName, profilePicUrl: null });
        }
      }
    } catch (e) { console.error("GET /contacts error:", e); }

    // SOURCE 2: POST /chat/find with pagination (gets ALL chats including archived)
    let chatPage = 1;
    let totalChatsFromAPI = 0;
    while (true) {
      try {
        const resp = await fetch(`${baseUrl}/chat/find`, {
          method: "POST", headers: h,
          body: JSON.stringify({ page: chatPage, limit: 500 }),
        });
        if (!resp.ok) { console.error(`/chat/find page ${chatPage}: HTTP ${resp.status}`); break; }
        const data = await resp.json();
        // Handle multiple response structures
        const chats = data.chats || data.data || data.records || (Array.isArray(data) ? data : []);
        const pagination = data.pagination || {};
        
        if (chatPage === 1) {
          totalChatsFromAPI = data.totalChatsStats?.total_chats?.total || pagination.totalRecords || 0;
          console.log(`/chat/find: totalChats=${totalChatsFromAPI}, totalRecords=${pagination.totalRecords}`);
        }
        
        console.log(`/chat/find page ${chatPage}: ${chats.length} chats`);
        
        for (const chat of chats) {
          const chatId = chat.wa_chatid || "";
          if (chatId.includes("@g.us") || chatId.includes("broadcast") || chatId.includes("status")) continue;
          
          const phone = extractPhone(chatId || chat.phone || "");
          if (!phone || phone.length < 10) continue;
          const normalized = normalizePhone(phone);
          
          // Extract name from multiple fields (priority order)
          const name = chat.wa_contactName || chat.wa_name || chat.name || 
                       chat.lead_name || chat.lead_fullName || "";
          const cleanName = name.trim() && name.trim() !== "." ? name.trim() : null;
          
          // Extract profile picture
          const picUrl = chat.image || chat.imagePreview || null;
          
          const existing = contactMap.get(normalized);
          if (!existing) {
            contactMap.set(normalized, { name: cleanName, profilePicUrl: picUrl || null });
          } else {
            // Prefer saved contact name, but fill in gaps
            if (!existing.name && cleanName) existing.name = cleanName;
            if (!existing.profilePicUrl && picUrl) existing.profilePicUrl = picUrl;
          }
        }
        
        if (chats.length === 0 || !pagination.hasNextPage) break;
        chatPage++;
        if (chatPage > 50) break; // safety
      } catch (e) {
        console.error(`/chat/find page ${chatPage} error:`, e);
        break;
      }
    }

    console.log(`Contact map: ${contactMap.size} contacts, ${Array.from(contactMap.values()).filter(c => c.name).length} with names`);

    // =============================================
    // STEP 2: Load leads and existing message IDs
    // =============================================
    console.log("=== STEP 2: Loading existing data ===");
    const { data: leads } = await supabase.from("leads").select("id, phone, name");
    
    // Enrich contact map with lead names
    if (leads) {
      for (const lead of leads) {
        const leadNorm = normalizePhone(lead.phone.replace(/\D/g, ""));
        const existing = contactMap.get(leadNorm);
        if (!existing) {
          contactMap.set(leadNorm, { name: lead.name, profilePicUrl: null });
        } else if (!existing.name && lead.name) {
          existing.name = lead.name;
        }
      }
    }

    // Load existing message IDs efficiently
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
    // STEP 3: Save ALL contacts to whatsapp_contacts
    // =============================================
    console.log("=== STEP 3: Saving all contacts ===");
    let contactsSaved = 0;
    const contactBatch: any[] = [];
    for (const [phone, info] of contactMap) {
      contactBatch.push({
        user_id: userId,
        phone,
        contact_name: info.name,
        updated_at: new Date().toISOString(),
      });
    }
    // Upsert in batches of 100
    for (let i = 0; i < contactBatch.length; i += 100) {
      const chunk = contactBatch.slice(i, i + 100);
      const { error } = await supabase
        .from("whatsapp_contacts")
        .upsert(chunk, { onConflict: "user_id,phone" });
      if (!error) contactsSaved += chunk.length;
      else console.error("Contact upsert error:", error.message);
    }
    console.log(`Contacts saved/updated: ${contactsSaved}`);

    // =============================================
    // STEP 4: Fetch ALL messages (no limits)
    // =============================================
    console.log("=== STEP 4: Fetching ALL messages ===");
    const messagesToInsert: any[] = [];
    let totalFetched = 0;
    let totalSkipped = 0;
    const seenIds = new Set<string>();
    let offset = 0;
    const batchSize = 500;
    let consecutiveEmpty = 0;

    while (true) {
      try {
        const msgResp = await fetch(`${baseUrl}/message/find`, {
          method: "POST", headers: h,
          body: JSON.stringify({ count: batchSize, offset }),
        });

        if (!msgResp.ok) {
          console.error(`/message/find HTTP ${msgResp.status} at offset ${offset}`);
          break;
        }

        const msgData = await msgResp.json();
        const messages = msgData.messages || msgData.data || [];

        if (messages.length === 0) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 3) break;
          offset += batchSize;
          continue;
        }
        consecutiveEmpty = 0;
        totalFetched += messages.length;

        for (const msg of messages) {
          const msgId = msg.messageid || msg.id || msg.key?.id || null;
          const fullId = msg.id || (msg.owner && msgId ? `${msg.owner}:${msgId}` : msgId);

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

          // Extract content
          let content: string | null = null;
          let messageType = "text";

          if (msg.text) content = msg.text;
          else if (msg.content?.text) content = msg.content.text;
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

          const mediaUrl = msg.fileURL || msg.mediaUrl || msg.content?.URL || null;
          const contactInfo = contactMap.get(normalizedMsgPhone);
          const msgContactName = contactInfo?.name || 
                                 msg.senderName || msg.pushName || msg.notifyName || null;

          // Capture pushName/senderName for contacts we didn't have names for
          if (contactInfo && !contactInfo.name) {
            const pName = msg.senderName || msg.pushName || msg.notifyName || "";
            if (pName.trim() && pName.trim() !== ".") {
              contactInfo.name = pName.trim();
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
        }

        // Increment by actual messages returned, not batchSize — API caps at ~200
        offset += messages.length;
        
        console.log(`Batch: ${messages.length} msgs, offset now: ${offset}, total: ${totalFetched}`);
        if (offset > 500000) break; // extreme safety only
      } catch (e) {
        console.error(`Error at offset ${offset}:`, e);
        break;
      }
    }

    console.log(`Fetched: ${totalFetched}, new: ${messagesToInsert.length}, skipped: ${totalSkipped}`);

    // =============================================
    // STEP 5: Insert new messages
    // =============================================
    let insertedCount = 0;
    const insertedMessages: { id: string; message_type: string; uazapi_message_id: string | null }[] = [];
    
    for (let i = 0; i < messagesToInsert.length; i += 200) {
      const chunk = messagesToInsert.slice(i, i + 200);
      const { data: inserted, error } = await supabase
        .from("whatsapp_messages")
        .insert(chunk)
        .select("id, message_type, uazapi_message_id");
      if (error) console.error(`Insert error chunk ${i}:`, error.message);
      else {
        insertedCount += (inserted?.length || chunk.length);
        if (inserted) insertedMessages.push(...inserted);
      }
    }

    // =============================================
    // STEP 5.1: Auto-create leads for contacts without lead_id
    // =============================================
    console.log("=== STEP 5.1: Auto-creating leads for unlinked contacts ===");
    let autoCreated = 0;

    // Build lead phone map
    const leadPhoneMap = new Map<string, string>();
    if (leads) {
      for (const lead of leads) {
        leadPhoneMap.set(normalizePhone(lead.phone.replace(/\D/g, "")), lead.id);
      }
    }

    for (const [phone, info] of contactMap) {
      const normalized = normalizePhone(phone);
      if (leadPhoneMap.has(normalized)) continue;

      // Determine stage from messages
      const { data: msgs } = await supabase
        .from("whatsapp_messages")
        .select("direction")
        .eq("phone", normalized)
        .eq("user_id", userId)
        .limit(50);

      const hasInbound = msgs?.some((m) => m.direction === "inbound") || false;
      const hasOutbound = msgs?.some((m) => m.direction === "outbound") || false;

      let stage = "novo";
      if (hasInbound && hasOutbound) stage = "contato_realizado";
      else if (hasOutbound && !hasInbound) stage = "tentativa_contato";

      const name = info.name || normalized;
      const { data: newLead, error: leadError } = await supabase
        .from("leads")
        .insert({ user_id: userId, name, phone: normalized, stage, type: "PF" })
        .select("id")
        .single();

      if (!leadError && newLead) {
        leadPhoneMap.set(normalized, newLead.id);
        autoCreated++;

        // Link messages
        await supabase
          .from("whatsapp_messages")
          .update({ lead_id: newLead.id })
          .eq("phone", normalized)
          .eq("user_id", userId)
          .is("lead_id", null);

        // Link contact
        await supabase
          .from("whatsapp_contacts")
          .update({ lead_id: newLead.id })
          .eq("phone", normalized)
          .eq("user_id", userId);

        // Initialize lead_memory
        await supabase.from("lead_memory").insert({
          user_id: userId,
          lead_id: newLead.id,
          summary: null,
          structured_json: {},
        });

        // Update last_contact_at from most recent message
        const { data: lastMsg } = await supabase
          .from("whatsapp_messages")
          .select("created_at")
          .eq("lead_id", newLead.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastMsg) {
          await supabase.from("leads").update({ last_contact_at: lastMsg.created_at }).eq("id", newLead.id);
        }

        // Log
        await supabase.from("action_log").insert({
          user_id: userId,
          lead_id: newLead.id,
          action_type: "auto_lead_created",
          metadata: { source: "sync", phone: normalized, stage },
        });
      }
    }
    console.log(`Auto-created ${autoCreated} leads during sync`);

    // =============================================
    // STEP 5.5: Process media via unified pipeline
    // =============================================
    const allMediaMessages = insertedMessages.filter(
      m => ["image", "document", "audio", "ptt"].includes(m.message_type)
    );
    let mediaProcessed = 0;

    if (allMediaMessages.length > 0) {
      console.log(`=== STEP 5.5: Processing ${allMediaMessages.length} media messages ===`);
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      
      for (let i = 0; i < allMediaMessages.length; i += 3) {
        const batch = allMediaMessages.slice(i, i + 3);
        const promises = batch.map(async (msg) => {
          try {
            const resp = await fetch(`${SUPABASE_URL}/functions/v1/process-message-media`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messageId: msg.id }),
            });
            if (resp.ok) {
              const result = await resp.json();
              if (result.processed) mediaProcessed++;
            }
          } catch (e) {
            console.error(`Process media error for ${msg.id}:`, e);
          }
        });
        await Promise.all(promises);
      }
      console.log(`Media processed: ${mediaProcessed}/${allMediaMessages.length}`);
    }

    // =============================================
    // STEP 6: Backfill names + update contacts with pushNames + ENRICH LEAD NAMES
    // =============================================
    let namesUpdated = 0;
    let leadsEnriched = 0;
    const contactUpdates: any[] = [];

    // Reload leads to get current state after auto-creation
    const { data: allLeads } = await supabase.from("leads").select("id, phone, name");
    
    for (const [phone, info] of contactMap) {
      if (!info.name) continue;

      // Update messages missing contact_name
      const { count } = await supabase
        .from("whatsapp_messages")
        .update({ contact_name: info.name })
        .is("contact_name", null)
        .eq("phone", phone)
        .select("id", { count: "exact", head: true });
      if (count && count > 0) namesUpdated += count;

      // Queue contact update with any new names from pushNames
      contactUpdates.push({
        user_id: userId,
        phone,
        contact_name: info.name,
        updated_at: new Date().toISOString(),
      });

      // ═══ LEAD NAME ENRICHMENT ═══
      // Find lead with this phone whose name is still the phone fallback
      if (allLeads) {
        const normalized = normalizePhone(phone);
        for (const lead of allLeads) {
          const leadPhoneNorm = normalizePhone(lead.phone.replace(/\D/g, ""));
          if (leadPhoneNorm !== normalized) continue;
          
          const leadNameDigits = lead.name.replace(/\D/g, "");
          const isPhoneFallback = leadNameDigits.length >= 10 && (
            leadNameDigits === leadPhoneNorm ||
            leadNameDigits === leadPhoneNorm.slice(2) ||
            leadPhoneNorm.endsWith(leadNameDigits) ||
            leadNameDigits.endsWith(leadPhoneNorm.slice(2))
          );
          if (isPhoneFallback) {
            await supabase.from("leads").update({ name: info.name }).eq("id", lead.id);
            leadsEnriched++;
            console.log(`Lead ${lead.id} name enriched: "${lead.name}" → "${info.name}"`);
          }
          break;
        }
      }
    }

    // Batch update contacts with new names
    for (let i = 0; i < contactUpdates.length; i += 100) {
      const chunk = contactUpdates.slice(i, i + 100);
      await supabase.from("whatsapp_contacts").upsert(chunk, { onConflict: "user_id,phone" });
    }

    const summary = {
      success: true,
      totalContacts: contactMap.size,
      contactsWithNames: Array.from(contactMap.values()).filter(c => c.name).length,
      totalChatsFromAPI,
      totalMessagesFetched: totalFetched,
      totalImported: insertedCount,
      totalSkipped,
      namesUpdated,
      leadsEnriched,
      contactsSaved,
      mediaProcessed,
      totalMediaFound: allMediaMessages.length,
      autoCreatedLeads: autoCreated,
    };

    console.log(`=== DONE ===`, JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
