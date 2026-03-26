import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Get all contacts without lead_id
    const { data: contacts, error: contactsError } = await supabase
      .from("whatsapp_contacts")
      .select("id, phone, contact_name, lead_id, is_personal")
      .eq("user_id", userId);

    if (contactsError) throw new Error(contactsError.message);

    const allContacts = contacts || [];
    const withLead = allContacts.filter((c) => c.lead_id);
    const withoutLead = allContacts.filter((c) => !c.lead_id && !c.is_personal);
    const personalCount = allContacts.filter((c) => c.is_personal).length;

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    if (dryRun) {
      return new Response(
        JSON.stringify({
          totalContacts: allContacts.length,
          withLeadId: withLead.length,
          toCreate: withoutLead.length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get existing leads to deduplicate by phone
    const { data: existingLeads } = await supabase
      .from("leads")
      .select("id, phone, name")
      .eq("user_id", userId);

    const leadPhoneMap = new Map<string, string>();
    if (existingLeads) {
      for (const lead of existingLeads) {
        leadPhoneMap.set(normalizePhone(lead.phone), lead.id);
      }
    }

    let created = 0;
    let linked = 0;
    let skipped = 0;

    for (const contact of withoutLead) {
      const normalized = normalizePhone(contact.phone);
      let leadId = leadPhoneMap.get(normalized);

      if (leadId) {
        // Lead exists — enrich name if still phone fallback
        if (contact.contact_name) {
          const existingLead = existingLeads?.find(l => l.id === leadId);
          if (existingLead) {
            const nameDigits = existingLead.phone ? normalizePhone(existingLead.phone.replace(/\D/g, "")) : "";
            const leadNameDigits = (existingLead as any).name?.replace(/\D/g, "") || "";
            const isPhoneFallback = leadNameDigits.length >= 10 && (
              leadNameDigits === nameDigits || nameDigits.endsWith(leadNameDigits) || leadNameDigits.endsWith(nameDigits.slice(2))
            );
            if (isPhoneFallback) {
              await supabase.from("leads").update({ name: contact.contact_name }).eq("id", leadId);
            }
          }
        }
        linked++;
      } else {
        // Determine initial stage based on message history
        const { data: msgs } = await supabase
          .from("whatsapp_messages")
          .select("direction")
          .eq("phone", normalized)
          .limit(50);

        const hasInbound = msgs?.some((m) => m.direction === "inbound") || false;
        const hasOutbound = msgs?.some((m) => m.direction === "outbound") || false;

        let stage = "novo";
        if (hasInbound && hasOutbound) stage = "contato_realizado";
        else if (hasOutbound && !hasInbound) stage = "tentativa_contato";

        const name = contact.contact_name || normalized;

        const { data: newLead, error: leadError } = await supabase
          .from("leads")
          .insert({
            user_id: userId,
            name,
            phone: normalized,
            stage,
            type: "PF",
          })
          .select("id")
          .single();

        if (leadError) {
          console.error(`Error creating lead for ${normalized}:`, leadError.message);
          skipped++;
          continue;
        }

        leadId = newLead.id;
        leadPhoneMap.set(normalized, leadId);
        created++;

        // Log auto creation
        await supabase.from("action_log").insert({
          user_id: userId,
          lead_id: leadId,
          action_type: "auto_lead_created",
          metadata: { source: "bootstrap", contact_id: contact.id, stage },
        });
      }

      // Link contact to lead
      await supabase
        .from("whatsapp_contacts")
        .update({ lead_id: leadId })
        .eq("id", contact.id);

      // Also link messages
      await supabase
        .from("whatsapp_messages")
        .update({ lead_id: leadId })
        .eq("phone", normalizePhone(contact.phone))
        .is("lead_id", null);
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalContacts: allContacts.length,
        alreadyLinked: withLead.length,
        created,
        linked,
        skipped,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Bootstrap error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
