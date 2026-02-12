import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function tryEndpoints(baseUrl: string, headers: Record<string, string>, paths: string[], method = "GET", body?: string): Promise<{ data: any; path: string } | null> {
  for (const path of paths) {
    try {
      const opts: RequestInit = { method, headers };
      if (body && method === "POST") opts.body = body;
      
      const resp = await fetch(`${baseUrl}${path}`, opts);
      console.log(`${method} ${path} => ${resp.status}`);
      
      if (resp.ok) {
        const data = await resp.json();
        console.log(`${path} response keys:`, JSON.stringify(Object.keys(data)).slice(0, 200));
        if (Array.isArray(data)) {
          console.log(`${path} returned array with ${data.length} items`);
        }
        return { data, path };
      } else {
        const errText = await resp.text();
        console.log(`${path} error: ${errText.slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`${path} fetch error: ${e}`);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
    if (!UAZAPI_URL || !UAZAPI_TOKEN) throw new Error("UaZapi credentials not configured");

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const baseUrl = UAZAPI_URL.replace(/\/+$/, "");
    const apiHeaders = { "Content-Type": "application/json", token: UAZAPI_TOKEN };

    // Step 1: Find the correct endpoint for listing chats
    console.log("=== SYNC: Discovering chat endpoints ===");
    console.log("Base URL:", baseUrl);
    
    const chatResult = await tryEndpoints(baseUrl, apiHeaders, [
      "/chats",
      "/v1/chats", 
      "/chat/page?page=1&pageSize=100",
      "/chat/list",
      "/chat/all",
      "/chat/page",
      "/contacts",
      "/contact/list",
      "/contact/all",
    ]);

    let allChats: any[] = [];
    
    if (chatResult) {
      console.log(`Chat endpoint found: ${chatResult.path}`);
      const d = chatResult.data;
      allChats = Array.isArray(d) ? d : (d.chats || d.data || d.contacts || d.records || d.result || []);
    } else {
      console.log("No chat list endpoint found, trying message search approach...");
      
      // Alternative: get messages from specific known phones from our DB
      const { data: existingPhones } = await supabase
        .from("whatsapp_messages")
        .select("phone")
        .order("created_at", { ascending: false });
      
      const uniquePhones = [...new Set((existingPhones || []).map(m => m.phone))];
      console.log(`Will try to fetch messages for ${uniquePhones.length} known phones`);
      
      // Convert to chat-like objects
      allChats = uniquePhones.map(p => ({ phone: p }));
    }

    console.log(`Total chats/contacts to process: ${allChats.length}`);

    // Get existing leads for matching
    const { data: leads } = await supabase.from("leads").select("id, phone, name");
    
    // Get existing uazapi message IDs to avoid duplicates
    const { data: existingMsgs } = await supabase
      .from("whatsapp_messages")
      .select("uazapi_message_id")
      .not("uazapi_message_id", "is", null);
    
    const existingIds = new Set((existingMsgs || []).map(m => m.uazapi_message_id));

    let totalImported = 0;
    let totalSkipped = 0;
    const processedPhones: string[] = [];

    // Step 2: For each chat, try to fetch message history
    for (const chat of allChats) {
      const rawPhone = chat.phone || chat.jid || chat.id || chat.number || "";
      const phone = rawPhone.replace("@s.whatsapp.net", "").replace("@g.us", "").replace(/\D/g, "");
      
      // Skip groups and invalid
      if (rawPhone.includes("@g.us") || phone.includes("-") || !phone || phone.length < 10) {
        continue;
      }

      const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;

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

      // Try to fetch messages for this chat
      const msgResult = await tryEndpoints(baseUrl, apiHeaders, [
        `/chat/messages/${phone}?count=100`,
        `/chat/messages?phone=${phone}&count=100`,
        `/message/list?phone=${phone}&count=100`,
        `/messages/${phone}?count=100`,
        `/v1/messages/${phone}`,
      ]);

      // Also try POST variants
      let chatMessages: any[] = [];
      if (msgResult) {
        const md = msgResult.data;
        chatMessages = Array.isArray(md) ? md : (md.messages || md.data || md.records || md.result || []);
        console.log(`Got ${chatMessages.length} messages for ${normalizedPhone} via ${msgResult.path}`);
      } else {
        // Try POST
        const postResult = await tryEndpoints(baseUrl, apiHeaders, [
          `/chat/messages`,
          `/message/list`,
        ], "POST", JSON.stringify({ phone, count: 100 }));
        
        if (postResult) {
          const md = postResult.data;
          chatMessages = Array.isArray(md) ? md : (md.messages || md.data || md.records || md.result || []);
          console.log(`Got ${chatMessages.length} messages for ${normalizedPhone} via POST ${postResult.path}`);
        }
      }

      // Save messages
      const messagesToInsert: any[] = [];
      
      for (const msg of chatMessages) {
        const msgId = msg.id || msg.key?.id || msg.messageId || null;
        
        if (msgId && existingIds.has(msgId)) {
          totalSkipped++;
          continue;
        }

        const isFromMe = msg.fromMe === true || msg.key?.fromMe === true;
        const content = msg.body || msg.text || msg.conversation || msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || msg.caption || msg.content || null;
        const timestamp = msg.timestamp || msg.messageTimestamp || msg.t || msg.created_at;
        
        let createdAt: string;
        if (timestamp) {
          const ts = typeof timestamp === "number" 
            ? (timestamp > 1e12 ? timestamp : timestamp * 1000) 
            : new Date(timestamp).getTime();
          createdAt = new Date(ts).toISOString();
        } else {
          createdAt = new Date().toISOString();
        }

        let messageType = "text";
        const m = msg.message || msg;
        if (m.imageMessage || msg.type === "image") messageType = "image";
        else if (m.audioMessage || msg.type === "audio" || msg.type === "ptt") messageType = "audio";
        else if (m.videoMessage || msg.type === "video") messageType = "video";
        else if (m.documentMessage || msg.type === "document") messageType = "document";
        else if (m.stickerMessage || msg.type === "sticker") messageType = "sticker";

        messagesToInsert.push({
          user_id: userId,
          lead_id: leadId,
          phone: normalizedPhone,
          direction: isFromMe ? "outbound" : "inbound",
          message_type: messageType,
          content: content,
          media_url: msg.mediaUrl || msg.url || null,
          uazapi_message_id: msgId,
          status: isFromMe ? "sent" : "received",
          created_at: createdAt,
        });

        if (msgId) existingIds.add(msgId);
      }

      // Batch insert
      if (messagesToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("whatsapp_messages")
          .insert(messagesToInsert);

        if (insertError) {
          console.error(`Insert error for ${normalizedPhone}:`, insertError.message);
        } else {
          totalImported += messagesToInsert.length;
          processedPhones.push(normalizedPhone);
        }
      }
    }

    console.log(`=== SYNC COMPLETE: ${totalImported} imported, ${totalSkipped} skipped, ${processedPhones.length} conversations ===`);

    return new Response(
      JSON.stringify({
        success: true,
        totalChats: allChats.length,
        totalImported,
        totalSkipped,
        conversations: processedPhones.length,
        chatEndpoint: chatResult?.path || "fallback (existing phones)",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
