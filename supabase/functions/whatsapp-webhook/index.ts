import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ══════════════════════════════════════════
// PHONE NORMALIZATION — single source of truth
// ══════════════════════════════════════════
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function phoneVariants(phone: string): string[] {
  const norm = normalizePhone(phone);
  const without55 = norm.startsWith("55") ? norm.slice(2) : norm;
  return [norm, without55];
}

// ══════════════════════════════════════════
// ENSURE LEAD EXISTS — guaranteed lead for every phone
// ══════════════════════════════════════════
async function ensureLeadExists(
  supabase: any,
  phone: string,
  userId: string,
  opts: {
    contactName?: string | null;
    isFromMe: boolean;
    messageId?: string;
  }
): Promise<string | null> {
  const normalized = normalizePhone(phone);
  const variants = phoneVariants(phone);

  // Check if contact is marked as personal — skip lead creation
  for (const v of variants) {
    const { data: personalContact } = await supabase
      .from("whatsapp_contacts")
      .select("is_personal")
      .eq("phone", v)
      .eq("user_id", userId)
      .eq("is_personal", true)
      .maybeSingle();
    if (personalContact) {
      console.log(`Skipping lead creation for personal contact: ${normalized}`);
      return null;
    }
  }

  // Step 1: Find existing lead (check all phone variants)
  const { data: leads } = await supabase
    .from("leads")
    .select("id, phone")
    .eq("user_id", userId);

  if (leads) {
    for (const lead of leads) {
      const leadVariants = phoneVariants(lead.phone);
      if (variants.some(v => leadVariants.includes(v))) {
        // Found! Link the message if needed
        if (opts.messageId) {
          await supabase.from("whatsapp_messages")
            .update({ lead_id: lead.id })
            .eq("id", opts.messageId)
            .is("lead_id", null);
        }
        return lead.id;
      }
    }
  }

  // Step 2: No lead found. Dedup guard — check again with normalized phone (race condition)
  const { data: existingByPhone } = await supabase
    .from("leads")
    .select("id")
    .eq("user_id", userId)
    .or(`phone.eq.${normalized},phone.eq.${normalized.slice(2)}`)
    .maybeSingle();

  if (existingByPhone) {
    if (opts.messageId) {
      await supabase.from("whatsapp_messages")
        .update({ lead_id: existingByPhone.id })
        .eq("id", opts.messageId)
        .is("lead_id", null);
    }
    // Also link all orphan messages for this phone
    for (const v of variants) {
      await supabase.from("whatsapp_messages")
        .update({ lead_id: existingByPhone.id })
        .eq("phone", v)
        .eq("user_id", userId)
        .is("lead_id", null);
    }
    return existingByPhone.id;
  }

  // Step 3: Determine stage from message history
  const { data: msgs } = await supabase
    .from("whatsapp_messages")
    .select("direction")
    .or(variants.map(v => `phone.eq.${v}`).join(","))
    .eq("user_id", userId)
    .limit(50);

  const hasInbound = msgs?.some((m: any) => m.direction === "inbound") || !opts.isFromMe;
  const hasOutbound = msgs?.some((m: any) => m.direction === "outbound") || opts.isFromMe;

  let stage = "novo";
  if (hasInbound && hasOutbound) stage = "contato_realizado";
  else if (hasOutbound && !hasInbound) stage = "tentativa_contato";

  // Step 4: Create lead
  const leadName = opts.contactName || normalized;
  const { data: newLead, error: leadError } = await supabase
    .from("leads")
    .insert({
      user_id: userId,
      name: leadName,
      phone: normalized,
      stage,
      type: "PF",
    })
    .select("id")
    .single();

  if (leadError) {
    console.error("ensureLeadExists: create error:", leadError.message);
    // Final fallback: maybe another concurrent request created it
    const { data: fallback } = await supabase
      .from("leads")
      .select("id")
      .eq("user_id", userId)
      .eq("phone", normalized)
      .maybeSingle();
    if (fallback) {
      console.log("ensureLeadExists: found lead after create error (race condition handled)");
      if (opts.messageId) {
        await supabase.from("whatsapp_messages")
          .update({ lead_id: fallback.id })
          .eq("id", opts.messageId);
      }
      return fallback.id;
    }
    throw new Error(`Failed to create lead: ${leadError.message}`);
  }

  const leadId = newLead.id;
  console.log(`ensureLeadExists: CREATED lead ${leadId} for ${normalized}, stage: ${stage}`);

  // Step 5: Link ALL orphan messages for this phone
  for (const v of variants) {
    await supabase.from("whatsapp_messages")
      .update({ lead_id: leadId })
      .eq("phone", v)
      .eq("user_id", userId)
      .is("lead_id", null);
  }

  // Step 6: Link contact
  for (const v of variants) {
    await supabase.from("whatsapp_contacts")
      .update({ lead_id: leadId })
      .eq("phone", v)
      .eq("user_id", userId);
  }

  // Step 7: Initialize lead_memory
  await supabase.from("lead_memory").insert({
    user_id: userId,
    lead_id: leadId,
    summary: null,
    structured_json: {},
  });

  // Step 8: Update last_contact_at
  const { data: lastMsg } = await supabase
    .from("whatsapp_messages")
    .select("created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastMsg) {
    await supabase.from("leads").update({ last_contact_at: lastMsg.created_at }).eq("id", leadId);
  }

  // Step 9: Audit log
  await supabase.from("action_log").insert({
    user_id: userId,
    lead_id: leadId,
    action_type: "auto_lead_created",
    metadata: { source: "webhook", phone: normalized, stage, trigger: opts.isFromMe ? "outbound" : "inbound" },
  });

  return leadId;
}

// ══════════════════════════════════════════
// RESOLVE USER ID — multi-strategy fallback
// ══════════════════════════════════════════
async function resolveUserId(supabase: any, phone: string, payload: any): Promise<string | null> {
  const variants = phoneVariants(phone);

  // Strategy 1: From leads
  const { data: leads } = await supabase
    .from("leads")
    .select("id, user_id, phone");
  if (leads) {
    for (const lead of leads) {
      const leadVariants = phoneVariants(lead.phone);
      if (variants.some(v => leadVariants.includes(v))) return lead.user_id;
    }
  }

  // Strategy 2: From previous messages
  for (const v of variants) {
    const { data: msg } = await supabase
      .from("whatsapp_messages")
      .select("user_id")
      .eq("phone", v)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (msg) return msg.user_id;
  }

  // Strategy 3: From contacts
  for (const v of variants) {
    const { data: contact } = await supabase
      .from("whatsapp_contacts")
      .select("user_id")
      .eq("phone", v)
      .limit(1)
      .maybeSingle();
    if (contact) return contact.user_id;
  }

  // Strategy 4: Owner-based resolution (for single-user instances)
  // Find ANY user that has data in the system
  const { data: anyMsg } = await supabase
    .from("whatsapp_messages")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  if (anyMsg) {
    console.log("resolveUserId: used global fallback for phone:", phone);
    return anyMsg.user_id;
  }

  const { data: anyContact } = await supabase
    .from("whatsapp_contacts")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  if (anyContact) {
    console.log("resolveUserId: used contact fallback for phone:", phone);
    return anyContact.user_id;
  }

  return null;
}

// ══════════════════════════════════════════
// TEXT CLASSIFICATION
// ══════════════════════════════════════════
function classifyTextContent(content: string): { message_category: string; business_relevance_score: number; intent: string; classification_confidence: string } {
  if (!content || content.trim().length === 0) {
    return { message_category: "unknown", business_relevance_score: 0, intent: "none", classification_confidence: "low" };
  }
  const t = content.toLowerCase().trim();
  const greetingPatterns = [
    /^(bom dia|boa tarde|boa noite|oi|olá|ola|hey|eai|e ai|fala)/,
    /(bom dia|boa tarde|boa noite|feliz|abençoado|abençoada|sexta|segunda|terça|quarta|quinta|sábado|domingo)/,
    /(bença|deus|amém|gratidão|paz|🙏|😊|🌅|🌞|☀️|🙌|❤️|💛)/,
  ];
  const memePatterns = [/(kkkk|hahah|kkk|rsrs|😂|🤣|😅|😆)/, /^(sticker|figurinha)/];
  const healthPatterns = [
    /(plano|saúde|saude|operadora|unimed|amil|bradesco|sulamerica|hapvida|notredame|intermédica|golden|cross|coparticipação|carência|enfermaria|apartamento|rede credenciada|hospital|clínica|clinica)/,
    /(cotação|cotacao|proposta|orçamento|orcamento|reajuste|mensalidade|fatura|boleto|implantação|vigência)/,
    /(cpf|rg|contrato|documentação|carteirinha|ans|beneficiário|titular|dependente)/,
  ];
  const quotePatterns = [/(cotação|cotacao|proposta|orçamento|orcamento|valor|preço|preco|R\$|reais|mensalidade|tabela)/];
  const docPatterns = [/(cpf|rg|cnh|documento|certidão|comprovante|contrato|declaração)/];
  const isGreeting = greetingPatterns.some(p => p.test(t));
  const isMeme = memePatterns.some(p => p.test(t));
  const isHealth = healthPatterns.some(p => p.test(t));
  const isQuote = quotePatterns.some(p => p.test(t));
  const isDoc = docPatterns.some(p => p.test(t));
  if (t.length < 60 && isGreeting && !isHealth && !isQuote && !isDoc) {
    return { message_category: "greeting", business_relevance_score: 0.1, intent: "greeting", classification_confidence: "high" };
  }
  if (isMeme && !isHealth) {
    return { message_category: "meme_sticker", business_relevance_score: 0.05, intent: "none", classification_confidence: "high" };
  }
  if (isQuote) return { message_category: "quote", business_relevance_score: 0.95, intent: "quote_followup", classification_confidence: "medium" };
  if (isDoc) return { message_category: "documents", business_relevance_score: 0.9, intent: "ask_docs", classification_confidence: "medium" };
  if (isHealth) return { message_category: "health_content", business_relevance_score: 0.85, intent: "qualify", classification_confidence: "medium" };
  return { message_category: "small_talk", business_relevance_score: 0.3, intent: "none", classification_confidence: "low" };
}

// ══════════════════════════════════════════
// AUDIO DOWNLOAD & TRANSCRIPTION
// ══════════════════════════════════════════
async function downloadAudioFromUazapi(messageId: string): Promise<{ base64: string; format: string } | null> {
  try {
    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
    if (!UAZAPI_URL || !UAZAPI_TOKEN) return null;

    const baseUrl = UAZAPI_URL.replace(/\/+$/, "");
    const shortId = messageId.includes(":") ? messageId.split(":").pop()! : messageId;

    const resp = await fetch(`${baseUrl}/message/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
      body: JSON.stringify({ id: shortId, return_base64: true, generate_mp3: false, return_link: false }),
    });

    if (!resp.ok) { await resp.text(); return null; }
    const data = await resp.json();
    const b64 = data.base64Data || data.base64 || data.data || data.result;
    if (b64 && typeof b64 === "string" && b64.length > 100) {
      const fmt = (data.mimetype || "").includes("mp3") ? "mp3" : "ogg";
      return { base64: b64, format: fmt };
    }

    if (data.fileURL) {
      const fileResp = await fetch(data.fileURL);
      if (fileResp.ok) {
        const buf = await fileResp.arrayBuffer();
        const bytes = new Uint8Array(buf);
        if (bytes.length > 500) {
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192) {
            const chunk = bytes.subarray(i, Math.min(i + 8192, bytes.length));
            for (let j = 0; j < chunk.length; j++) binary += String.fromCharCode(chunk[j]);
          }
          return { base64: btoa(binary), format: "ogg" };
        }
      }
    }
    return null;
  } catch (error) { console.error("Audio download error:", error); return null; }
}

async function transcribeAudio(messageId: string): Promise<string | null> {
  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return null;

    const audioData = await downloadAudioFromUazapi(messageId);
    if (!audioData) return null;

    const mimeType = audioData.format === "mp3" ? "audio/mpeg" : "audio/ogg";
    const dataUri = `data:${mimeType};base64,${audioData.base64}`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash-lite",
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
  } catch (error) { console.error("Transcription error:", error); return null; }
}

// ══════════════════════════════════════════
// MAIN WEBHOOK HANDLER
// ══════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (req.method === "GET") {
    return new Response(JSON.stringify({ status: "ok", message: "Webhook is active" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
    const incomingToken = req.headers.get("token") || req.headers.get("x-token") || new URL(req.url).searchParams.get("token");
    if (UAZAPI_TOKEN && incomingToken && incomingToken !== UAZAPI_TOKEN) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    console.log("Webhook payload:", JSON.stringify(body).slice(0, 2000));

    // ===== STATUS UPDATES =====
    if (body.EventType === "message_status" || body.EventType === "ack" || body.event === "messages.update") {
      const msgId = body.message?.id || body.id || body.key?.id || body.data?.key?.id || null;
      const ackValue = body.ack ?? body.message?.ack ?? body.data?.update?.status ?? null;
      if (msgId && ackValue !== null) {
        const statusMap: Record<number, string> = { 0: "failed", 1: "queued", 2: "sent", 3: "delivered", 4: "read", 5: "read" };
        const newStatus = typeof ackValue === "number" ? (statusMap[ackValue] || "sent") : String(ackValue);
        await supabase.from("whatsapp_messages").update({ status: newStatus }).eq("uazapi_message_id", msgId);
        return new Response(JSON.stringify({ status: "ok", action: "status_update", newStatus }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ===== PARSE MESSAGE =====
    let phone: string | null = null;
    let content: string | null = null;
    let messageType = "text";
    let mediaUrl: string | null = null;
    let uazapiMessageId: string | null = null;
    let isFromMe = false;

    if (body.EventType === "messages" && body.chat) {
      phone = body.chat.phone?.replace(/\D/g, "") || null;
      isFromMe = body.fromMe === true || body.message?.fromMe === true;
      uazapiMessageId = body.message?.id || body.message?.key?.id || null;

      const m = body.message || {};
      content = m.body || m.text || m.conversation || m.caption || null;
      if (!content && m.message?.conversation) content = m.message.conversation;
      if (!content && m.message?.extendedTextMessage?.text) content = m.message.extendedTextMessage.text;

      const extractedMediaUrl = m.mediaUrl || m.url || m.content?.URL || null;
      const chatLastMsgType = (body.chat?.wa_lastMessageType || "").toLowerCase();
      const mimeType = (m.mimetype || m.content?.mimetype || "").toLowerCase();
      const isPtt = m.content?.PTT === true || m.type === "ptt" || chatLastMsgType === "audiomessage";

      if (m.type === "image" || chatLastMsgType === "imagemessage" || mimeType.startsWith("image")) {
        messageType = "image"; mediaUrl = extractedMediaUrl; if (!content) content = m.caption || null;
      } else if (m.type === "audio" || m.type === "ptt" || isPtt || chatLastMsgType === "audiomessage" || mimeType.startsWith("audio")) {
        messageType = "audio"; mediaUrl = extractedMediaUrl;
      } else if (m.type === "video" || chatLastMsgType === "videomessage" || mimeType.startsWith("video")) {
        messageType = "video"; mediaUrl = extractedMediaUrl;
      } else if (m.type === "document" || chatLastMsgType === "documentmessage") {
        messageType = "document"; mediaUrl = extractedMediaUrl; if (!content) content = m.fileName || null;
      } else if (m.type === "sticker" || chatLastMsgType === "stickermessage") {
        messageType = "sticker";
      } else if (m.type === "media" && extractedMediaUrl) {
        if (mimeType.startsWith("audio") || isPtt) messageType = "audio";
        else if (mimeType.startsWith("image")) messageType = "image";
        else if (mimeType.startsWith("video")) messageType = "video";
        else messageType = "document";
        mediaUrl = extractedMediaUrl;
      } else {
        messageType = m.type || "text";
        const validTypes = ["text", "audio", "ptt", "image", "document", "video", "sticker", "media", "unknown"];
        if (!validTypes.includes(messageType)) messageType = "unknown";
      }

      if (m.fromMe === true) isFromMe = true;
    } else {
      // Baileys/alternative format
      let msg: any = null;
      if (body.data?.key?.remoteJid) msg = body.data;
      else if (Array.isArray(body.data) && body.data.length > 0) msg = body.data[0];
      else if (body.key?.remoteJid) msg = body;
      else if (body.remoteJid || body.from) {
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
      console.log("No phone extracted, ignoring");
      return new Response(JSON.stringify({ status: "ignored", reason: "no phone" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (phone.includes("-")) {
      console.log("Group message, ignoring");
      return new Response(JSON.stringify({ status: "ignored", reason: "group message" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Dedup check
    if (uazapiMessageId) {
      const { data: existing } = await supabase
        .from("whatsapp_messages")
        .select("id")
        .eq("uazapi_message_id", uazapiMessageId)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ status: "ignored", reason: "duplicate" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const normalizedPhone = normalizePhone(phone);

    // ═══ RESOLVE USER ID ═══
    const userId = await resolveUserId(supabase, phone, body);
    if (!userId) {
      console.log("No matching user found for phone:", phone);
      return new Response(JSON.stringify({ status: "ignored", reason: "no matching user" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Extract contact name
    const contactName = body.chat?.wa_name || body.chat?.wa_contactName || 
                        body.chat?.name || body.chat?.lead_name || body.chat?.lead_fullName ||
                        body.message?.pushName || body.message?.notifyName || null;
    const cleanContactName = contactName && contactName.trim() && contactName !== "." ? contactName.trim() : null;

    const direction = isFromMe ? "outbound" : "inbound";
    const msgStatus = isFromMe ? "sent" : "received";

    // Classify
    let msgClassification = { message_category: "unknown", business_relevance_score: 0, intent: "none", classification_confidence: "low" };
    if (messageType === "text" && content) msgClassification = classifyTextContent(content);
    else if (messageType === "sticker") msgClassification = { message_category: "meme_sticker", business_relevance_score: 0.05, intent: "none", classification_confidence: "high" };

    // ═══ SAVE MESSAGE ═══
    const { data: savedMsg, error: insertError } = await supabase
      .from("whatsapp_messages")
      .insert({
        user_id: userId,
        lead_id: null, // Will be set by ensureLeadExists
        phone: normalizedPhone,
        direction,
        message_type: messageType,
        content,
        media_url: mediaUrl,
        uazapi_message_id: uazapiMessageId,
        status: msgStatus,
        contact_name: cleanContactName,
        message_category: msgClassification.message_category,
        business_relevance_score: msgClassification.business_relevance_score,
        intent: msgClassification.intent,
        classification_confidence: msgClassification.classification_confidence,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("DB insert error:", JSON.stringify(insertError));
      throw new Error(`Failed to save message: ${insertError.message}`);
    }

    const messageId = savedMsg?.id;

    // ═══ ENSURE LEAD EXISTS (CRITICAL — GUARANTEED) ═══
    let leadId: string | null = null;
    try {
      leadId = await ensureLeadExists(supabase, phone, userId, {
        contactName: cleanContactName,
        isFromMe,
        messageId,
      });
      console.log(`Lead ensured: ${leadId} for phone ${normalizedPhone}`);

      // ═══ CONTACT NAME ENRICHMENT ═══
      // If lead name is still the phone fallback, enrich from contact name
      if (leadId && cleanContactName) {
        const { data: currentLead } = await supabase
          .from("leads")
          .select("name, phone")
          .eq("id", leadId)
          .single();
        if (currentLead) {
          const leadNameDigits = currentLead.name.replace(/\D/g, "");
          const leadPhoneNorm = normalizePhone(currentLead.phone.replace(/\D/g, ""));
          const isPhoneFallback = leadNameDigits.length >= 10 && (
            leadNameDigits === leadPhoneNorm ||
            leadNameDigits === leadPhoneNorm.slice(2) ||
            leadPhoneNorm.endsWith(leadNameDigits) ||
            leadNameDigits.endsWith(leadPhoneNorm.slice(2))
          );
          if (isPhoneFallback) {
            await supabase.from("leads").update({ name: cleanContactName }).eq("id", leadId);
            console.log(`Lead ${leadId} name enriched: "${currentLead.name}" → "${cleanContactName}"`);
          }
        }
      }
    } catch (e) {
      console.error("ensureLeadExists FAILED:", e);
      // Non-blocking: message is saved even if lead creation fails
    }

    // ═══ PROCESS MEDIA ═══
    const mediaTypes = ["audio", "ptt", "image", "document"];
    if (mediaTypes.includes(messageType) && messageId) {
      await supabase.from("whatsapp_messages").update({ processing_status: "pending" }).eq("id", messageId);
      try {
        const processResp = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-message-media`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId }) }
        );
        const processResult = await processResp.json();
        if (processResult.processed && processResult.extractedText) {
          const { data: updatedMsg } = await supabase.from("whatsapp_messages").select("content").eq("id", messageId).single();
          if (updatedMsg?.content) content = updatedMsg.content;
        }
      } catch (e) { console.error("Media processing error (non-blocking):", e); }
    }

    // ═══ UPDATE LEAD ═══
    if (leadId) {
      await supabase.from("leads").update({ last_contact_at: new Date().toISOString() }).eq("id", leadId);
    }

    // ═══ REAL-TIME STAGE TRANSITIONS ═══
    if (leadId) {
      const { data: currentLead } = await supabase.from("leads").select("stage").eq("id", leadId).single();
      const currentStage = currentLead?.stage;
      const excludedFromAuto = ["implantado", "declinado", "cancelado", "retrabalho"];

      // Inbound → auto-move to contato_realizado
      if (!isFromMe && currentStage && ["novo", "tentativa_contato"].includes(currentStage)) {
        await supabase.from("leads").update({ stage: "contato_realizado", updated_at: new Date().toISOString() }).eq("id", leadId);
        console.log(`Lead ${leadId} auto-moved to contato_realizado`);
      }

      // Inbound → pause active closing sequence
      if (!isFromMe) {
        const { data: activeSeq } = await supabase
          .from("closing_sequences")
          .select("id")
          .eq("lead_id", leadId)
          .eq("status", "active")
          .maybeSingle();
        if (activeSeq) {
          await supabase.from("closing_sequences").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", activeSeq.id);
          console.log(`Closing sequence ${activeSeq.id} paused (client responded)`);
        }
      }

      // Outbound → check retrabalho (6+ days, no response)
      if (isFromMe && currentStage && !excludedFromAuto.includes(currentStage)) {
        const { data: msgs } = await supabase
          .from("whatsapp_messages")
          .select("direction, created_at")
          .eq("phone", normalizedPhone)
          .eq("user_id", userId);
        if (msgs) {
          const outboundDays = new Set<string>();
          let hasInbound = false;
          for (const m of msgs) {
            if (m.direction === "outbound") outboundDays.add(m.created_at.slice(0, 10));
            if (m.direction === "inbound") hasInbound = true;
          }
          if (outboundDays.size >= 6 && !hasInbound) {
            await supabase.from("leads").update({ stage: "retrabalho", updated_at: new Date().toISOString() }).eq("id", leadId);
            console.log(`Lead ${leadId} auto-moved to retrabalho`);
          }
        }
      }
    }

    // ═══ LOG INTERACTION ═══
    if (leadId && userId) {
      const interactionLabel = isFromMe ? "Mensagem enviada" : "Mensagem recebida";
      await supabase.from("interactions").insert({
        lead_id: leadId,
        user_id: userId,
        type: isFromMe ? "whatsapp_sent" : "whatsapp_received",
        description: `${interactionLabel} via WhatsApp: ${(content || "[Mídia]").slice(0, 100)}`,
      });
    }

    console.log(`${direction} message saved for phone:`, normalizedPhone, "lead:", leadId);

    return new Response(
      JSON.stringify({ status: "ok", saved: true, direction, lead_id: leadId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
