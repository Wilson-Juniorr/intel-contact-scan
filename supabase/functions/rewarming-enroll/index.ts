import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { campaign_id } = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: camp } = await sb.from("rewarming_campaigns").select("*").eq("id", campaign_id).maybeSingle();
    if (!camp || !camp.ativo) throw new Error("Campanha inválida ou inativa");

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - camp.dias_inativo_min);

    let q = sb.from("leads").select("id,user_id,stage,type,last_contact_at").is("deleted_at", null).lt("last_contact_at", cutoff.toISOString());
    if (camp.estagios_alvo?.length) q = q.in("stage", camp.estagios_alvo);
    if (camp.excluir_perdidos) q = q.neq("stage", "perdido");
    if (camp.filtro_tipo?.length) q = q.in("type", camp.filtro_tipo);

    const { data: leads } = await q.limit(500);
    if (!leads?.length) return new Response(JSON.stringify({ enrolled: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const rows = leads.map((l: any) => ({
      lead_id: l.id, user_id: l.user_id, campaign_id,
      proxima_execucao: new Date().toISOString(),
    }));

    const { error, count } = await sb.from("rewarming_pool").upsert(rows, { onConflict: "lead_id,campaign_id", ignoreDuplicates: true, count: "exact" });
    if (error) throw error;

    return new Response(JSON.stringify({ enrolled: count ?? rows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});