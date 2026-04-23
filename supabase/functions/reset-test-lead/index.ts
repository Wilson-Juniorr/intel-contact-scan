// Reset test lead — apaga TODOS os rastros de um número (mensagens, conversas, leads, logs, memórias).
// Só admin pode chamar. Use para validar a SDR sem ruído de histórico anterior.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizePhones(input: string): string[] {
  const digits = input.replace(/\D/g, "");
  const variants = new Set<string>();
  variants.add(digits);
  if (digits.startsWith("55") && digits.length > 11) variants.add(digits.slice(2));
  else variants.add("55" + digits);
  return Array.from(variants);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { phone } = await req.json();
    if (!phone || typeof phone !== "string") {
      return new Response(JSON.stringify({ error: "phone obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validar admin pelo JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Apenas admin pode resetar leads de teste" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phones = normalizePhones(phone);
    const summary: Record<string, number> = {};

    // 1) Achar leads
    const { data: leads } = await supabase
      .from("leads")
      .select("id")
      .in("phone", phones);
    const leadIds = (leads ?? []).map((l: any) => l.id);

    // 2) Achar agent_conversations
    const { data: convs } = await supabase
      .from("agent_conversations")
      .select("id")
      .in("whatsapp_number", phones);
    const convIds = (convs ?? []).map((c: any) => c.id);

    // 3) Apagar dependências de conversations
    if (convIds.length) {
      const r1 = await supabase.from("agent_messages").delete().in("conversation_id", convIds);
      summary.agent_messages = r1.count ?? 0;
      await supabase.from("agent_critic_log").delete().in("conversation_id", convIds);
      await supabase.from("agent_split_log").delete().in("conversation_id", convIds);
      await supabase.from("agent_compliance_log").delete().in("conversation_id", convIds);
      await supabase.from("agent_handoffs").delete().in("conversation_id", convIds);
      await supabase.from("router_decisions").delete().in("conversation_id", convIds);
      const r2 = await supabase.from("agent_conversations").delete().in("id", convIds);
      summary.agent_conversations = r2.count ?? convIds.length;
    }

    // 4) Apagar mensagens / contatos whatsapp
    const r3 = await supabase.from("whatsapp_messages").delete().in("phone", phones);
    summary.whatsapp_messages = r3.count ?? 0;
    const r4 = await supabase.from("whatsapp_contacts").delete().in("phone", phones);
    summary.whatsapp_contacts = r4.count ?? 0;
    await supabase.from("conversation_classifications").delete().in("phone", phones);
    await supabase.from("scheduled_messages").delete().in("phone", phones);

    // 5) Apagar dependências de leads
    if (leadIds.length) {
      await supabase.from("lead_memory").delete().in("lead_id", leadIds);
      await supabase.from("lead_notes").delete().in("lead_id", leadIds);
      await supabase.from("lead_documents").delete().in("lead_id", leadIds);
      await supabase.from("lead_members").delete().in("lead_id", leadIds);
      await supabase.from("lead_checklist").delete().in("lead_id", leadIds);
      await supabase.from("interactions").delete().in("lead_id", leadIds);
      await supabase.from("reminders").delete().in("lead_id", leadIds);
      await supabase.from("tasks").delete().in("lead_id", leadIds);
      await supabase.from("notifications").delete().in("lead_id", leadIds);
      await supabase.from("action_log").delete().in("lead_id", leadIds);
      await supabase.from("follow_up_queue").delete().in("lead_id", leadIds);
      await supabase.from("rewarming_pool").delete().in("lead_id", leadIds);
      await supabase.from("rewarming_log").delete().in("lead_id", leadIds);
      await supabase.from("lead_routing_log").delete().in("lead_id", leadIds);
      // closing_steps -> closing_sequences
      const { data: seqs } = await supabase
        .from("closing_sequences")
        .select("id")
        .in("lead_id", leadIds);
      const seqIds = (seqs ?? []).map((s: any) => s.id);
      if (seqIds.length) {
        await supabase.from("closing_steps").delete().in("sequence_id", seqIds);
        await supabase.from("closing_sequences").delete().in("id", seqIds);
      }
      const r5 = await supabase.from("leads").delete().in("id", leadIds);
      summary.leads = r5.count ?? leadIds.length;
    }

    return new Response(
      JSON.stringify({ ok: true, phones, summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("reset-test-lead error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});