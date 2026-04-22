import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fillTemplate(tpl: string, lead: any) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (k === "nome") return (lead.name || "").split(" ")[0] || "";
    return lead[k] || "";
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = new Date();
    const dia = now.getDay();
    const hhmm = now.toTimeString().slice(0, 5);

    const { data: items } = await sb
      .from("rewarming_pool")
      .select("*, rewarming_campaigns(*), leads(*)")
      .eq("status", "ativo")
      .lte("proxima_execucao", now.toISOString())
      .limit(50);

    let executados = 0;
    for (const item of items || []) {
      const camp = item.rewarming_campaigns;
      const lead = item.leads;
      if (!camp || !lead || !camp.ativo) continue;

      // Janela
      if (camp.dias_semana?.length && !camp.dias_semana.includes(dia)) continue;
      if (hhmm < (camp.horario_envio || "00:00").slice(0, 5)) continue;

      // Pausa se houve resposta recente do lead
      const { data: ultMsg } = await sb
        .from("whatsapp_messages")
        .select("created_at,direction")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ultMsg?.direction === "inbound") {
        await sb.from("rewarming_pool").update({ status: "respondeu", motivo_saida: "lead respondeu", ultima_resposta_em: ultMsg.created_at }).eq("id", item.id);
        continue;
      }

      const tpl = camp.mensagens_template?.[item.tentativas_feitas] || camp.mensagens_template?.[camp.mensagens_template.length - 1];
      if (!tpl) continue;
      const mensagem = fillTemplate(tpl, lead);

      // Envia via send-whatsapp
      const { error: sendErr } = await sb.functions.invoke("send-whatsapp", {
        body: { phone: lead.phone, message: mensagem, lead_id: lead.id, user_id: lead.user_id },
      });

      const novaTentativa = item.tentativas_feitas + 1;
      const concluido = novaTentativa >= camp.max_tentativas;
      const proxima = new Date();
      proxima.setDate(proxima.getDate() + camp.intervalo_dias);

      await sb.from("rewarming_pool").update({
        tentativas_feitas: novaTentativa,
        proxima_execucao: proxima.toISOString(),
        status: concluido ? "concluido" : "ativo",
        motivo_saida: concluido ? "max_tentativas" : null,
      }).eq("id", item.id);

      await sb.from("rewarming_log").insert({
        pool_id: item.id, lead_id: lead.id, user_id: lead.user_id,
        tentativa: novaTentativa, mensagem,
        status: sendErr ? "erro" : "enviado",
        erro: sendErr?.message || null,
      });

      executados++;
    }

    return new Response(JSON.stringify({ executados, total: items?.length || 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});