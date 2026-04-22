import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { lead_id, origem, primeira_mensagem } = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: lead } = await sb.from("leads").select("*").eq("id", lead_id).maybeSingle();
    if (!lead) throw new Error("Lead não encontrado");

    const { data: rules } = await sb.from("lead_distribution_rules").select("*").eq("ativo", true).order("prioridade", { ascending: false });
    const now = new Date();
    const dia = now.getDay();
    const hhmm = now.toTimeString().slice(0, 5);
    const msg = (primeira_mensagem || "").toLowerCase();

    let escolhida: any = null;
    for (const r of rules || []) {
      if (r.filtro_tipo?.length && !r.filtro_tipo.includes(lead.type)) continue;
      if (r.filtro_origem?.length && origem && !r.filtro_origem.includes(origem)) continue;
      if (r.filtro_estagio?.length && !r.filtro_estagio.includes(lead.stage)) continue;
      if (r.filtro_palavras_chave?.length && !r.filtro_palavras_chave.some((k: string) => msg.includes(k.toLowerCase()))) continue;
      if (r.dias_semana?.length && !r.dias_semana.includes(dia)) continue;
      const dentroHora = r.horario_inicio <= r.horario_fim
        ? hhmm >= r.horario_inicio && hhmm <= r.horario_fim
        : hhmm >= r.horario_inicio || hhmm <= r.horario_fim;
      if (!dentroHora) {
        if (r.fora_horario_acao === "ignorar") continue;
      }
      escolhida = { rule: r, dentroHora };
      break;
    }

    let agente: string | null = null;
    let motivo = "Sem regra correspondente";
    if (escolhida) {
      const { rule, dentroHora } = escolhida;
      if (!dentroHora && rule.fora_horario_acao === "humano") {
        agente = null;
        motivo = `Fora do horário (${rule.nome}) → humano`;
      } else if (!dentroHora && rule.fora_horario_acao === "agendar") {
        agente = rule.agente_alvo;
        motivo = `Fora do horário (${rule.nome}) → agendado para ${agente || "humano"}`;
      } else if (rule.modo_distribuicao === "round_robin" && rule.agentes_pool?.length) {
        const { data: state } = await sb.from("lead_distribution_state").select("*").eq("rule_id", rule.id).maybeSingle();
        const idx = ((state?.ultimo_indice || 0) + 1) % rule.agentes_pool.length;
        agente = rule.agentes_pool[idx];
        await sb.from("lead_distribution_state").upsert({ rule_id: rule.id, ultimo_indice: idx, updated_at: new Date().toISOString() });
        motivo = `Round-robin (${rule.nome}) → ${agente}`;
      } else {
        agente = rule.agente_alvo;
        motivo = `Regra "${rule.nome}" → ${agente || "humano"}`;
      }

      // Garantir que o agente escolhido esteja ATIVO; senão, fallback para humano.
      if (agente) {
        const { data: agentRow } = await sb
          .from("agents_config")
          .select("slug, ativo")
          .eq("slug", agente)
          .maybeSingle();
        if (!agentRow || !agentRow.ativo) {
          motivo = `${motivo} (agente ${agente} inativo → humano)`;
          agente = null;
        }
      }

      await sb.from("lead_routing_log").insert({
        lead_id, rule_id: rule.id, rule_nome: rule.nome,
        agente_escolhido: agente, motivo,
        contexto: { origem, dia, hhmm, lead_type: lead.type, lead_stage: lead.stage },
      });
    } else {
      await sb.from("lead_routing_log").insert({ lead_id, agente_escolhido: null, motivo, contexto: { origem, dia, hhmm } });
    }

    return new Response(JSON.stringify({ agente, motivo, regra: escolhida?.rule?.nome || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});