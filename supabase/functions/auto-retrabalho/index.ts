import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // Auth validation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const excludedStages = ["implantado", "declinado", "cancelado", "retrabalho"];

    // Get all active leads
    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id, name, phone, stage, user_id")
      .not("stage", "in", `(${excludedStages.join(",")})`);

    if (leadsErr) throw leadsErr;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ moved: 0, leads: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const movedLeads: { id: string; name: string; user_id: string }[] = [];

    for (const lead of leads) {
      const cleanPhone = lead.phone.replace(/\D/g, "");

      // Get all messages for this lead's phone
      const { data: msgs, error: msgsErr } = await supabase
        .from("whatsapp_messages")
        .select("direction, created_at")
        .eq("phone", cleanPhone)
        .eq("user_id", lead.user_id)
        .order("created_at", { ascending: true });

      if (msgsErr || !msgs || msgs.length === 0) continue;

      // Count unique outbound days
      const outboundDays = new Set<string>();
      msgs.forEach((m) => {
        if (m.direction === "outbound") {
          outboundDays.add(m.created_at.slice(0, 10));
        }
      });

      // Check if there are any inbound messages (responses)
      const hasResponse = msgs.some((m) => m.direction === "inbound");

      // Rule: 6+ days with outbound attempts AND zero responses → retrabalho
      if (outboundDays.size >= 6 && !hasResponse) {
        const { error: updateErr } = await supabase
          .from("leads")
          .update({ stage: "retrabalho", updated_at: new Date().toISOString() })
          .eq("id", lead.id);

        if (!updateErr) {
          movedLeads.push({ id: lead.id, name: lead.name, user_id: lead.user_id });
        } else {
          console.error(`Failed to update lead ${lead.id}:`, updateErr);
        }
      }
    }

    console.log(`Auto-retrabalho: ${movedLeads.length} lead(s) moved`);

    return new Response(
      JSON.stringify({ moved: movedLeads.length, leads: movedLeads }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("auto-retrabalho error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
