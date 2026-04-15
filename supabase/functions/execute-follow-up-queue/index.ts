import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
    if (!UAZAPI_URL || !UAZAPI_TOKEN) {
      return new Response(JSON.stringify({ error: "WhatsApp not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch pending follow-ups
    const now = new Date().toISOString();
    const { data: queue, error: qErr } = await supabase
      .from("follow_up_queue")
      .select("*, leads(name, phone, stage, last_contact_at)")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (qErr) throw qErr;
    if (!queue || queue.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    let skipped = 0;

    for (const item of queue) {
      try {
        const lead = item.leads;
        if (!lead) {
          await supabase.from("follow_up_queue").update({ status: "failed" }).eq("id", item.id);
          continue;
        }

        // Check if contact is personal
        const phone = normalizePhone(lead.phone);
        const { data: contact } = await supabase
          .from("whatsapp_contacts")
          .select("is_personal")
          .eq("phone", phone)
          .eq("user_id", item.user_id)
          .maybeSingle();

        if (contact?.is_personal) {
          await supabase.from("follow_up_queue").update({ status: "cancelled" }).eq("id", item.id);
          skipped++;
          continue;
        }

        // Check if lead responded in last 24h
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { count: recentInbound } = await supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("phone", phone)
          .eq("direction", "inbound")
          .gte("created_at", yesterday);

        if ((recentInbound || 0) > 0) {
          await supabase.from("follow_up_queue").update({ status: "cancelled" }).eq("id", item.id);
          skipped++;
          continue;
        }

        // Check business hours (8h-18h BRT, weekdays)
        const brTime = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        const hour = brTime.getHours();
        const day = brTime.getDay();
        if (hour < 8 || hour >= 18 || day === 0 || day === 6) {
          continue; // Skip, will retry next cron run
        }

        // Get or generate message
        let message = item.message_content;
        if (!message) {
          const { data: genData } = await supabase.functions.invoke("follow-up-message", {
            body: { leadId: item.lead_id },
          });
          message = genData?.variants?.[0]?.message || genData?.message || `Olá ${lead.name}, tudo bem? Gostaria de dar continuidade ao nosso contato.`;
        }

        // Send via UaZapi
        const sendRes = await fetch(`${UAZAPI_URL}/sendText`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${UAZAPI_TOKEN}` },
          body: JSON.stringify({ phone, message }),
        });

        if (!sendRes.ok) {
          const errText = await sendRes.text();
          console.error(`[execute-follow-up-queue] Send failed for ${phone}: ${errText}`);
          await supabase.from("follow_up_queue").update({ status: "failed" }).eq("id", item.id);
          continue;
        }

        // Update queue item
        await supabase.from("follow_up_queue").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          message_content: message,
        }).eq("id", item.id);

        // Register interaction
        await supabase.from("interactions").insert({
          lead_id: item.lead_id,
          user_id: item.user_id,
          type: "whatsapp",
          description: `[Follow-up automático #${item.attempt_number}] ${message.slice(0, 100)}...`,
        });

        // Update lead's last_contact_at
        await supabase.from("leads").update({
          last_contact_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", item.lead_id);

        // Schedule next attempt if applicable
        if (item.attempt_number < item.max_attempts) {
          const nextDate = new Date();
          nextDate.setDate(nextDate.getDate() + 2);
          // Set to 9am BRT
          nextDate.setHours(12, 0, 0, 0); // 12 UTC = 9 BRT

          await supabase.from("follow_up_queue").insert({
            lead_id: item.lead_id,
            user_id: item.user_id,
            scheduled_at: nextDate.toISOString(),
            attempt_number: item.attempt_number + 1,
            max_attempts: item.max_attempts,
            status: "pending",
          });
        }

        // Create notification
        await supabase.from("notifications").insert({
          user_id: item.user_id,
          type: "follow_up_sent",
          title: "Follow-up enviado",
          body: `Mensagem automática enviada para ${lead.name}`,
          lead_id: item.lead_id,
        });

        processed++;

        // Rate limit: 1 msg/second
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (itemErr) {
        console.error(`[execute-follow-up-queue] Item error:`, itemErr);
        await supabase.from("follow_up_queue").update({ status: "failed" }).eq("id", item.id);
      }
    }

    return new Response(JSON.stringify({ processed, skipped, total: queue.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[execute-follow-up-queue] Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
