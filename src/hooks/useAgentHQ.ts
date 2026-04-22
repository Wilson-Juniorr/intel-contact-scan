import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AgentHQRange = "7d" | "30d" | "month";

export type AgentRow = {
  slug: string;
  nome: string;
  conversas: number;
  mensagens: number;
  qualificadas: number;
  transferidas: number;
  encerradas: number;
  ativas: number;
  taxa_qualificacao: number;
  taxa_transferencia: number;
  custo: number;
  custo_por_conv: number;
  tokens_in: number;
  tokens_out: number;
  tempo_medio_min: number;
  baloes_medio: number;
  critic_fails: number;
};

export type HQData = {
  totals: {
    conversas: number;
    mensagens: number;
    custo: number;
    tokens_in: number;
    tokens_out: number;
    qualificacao_pct: number;
    custo_por_conv: number;
    leads_gerados: number;
    custo_por_lead: number;
  };
  byDay: { day: string; mensagens: number; conversas: number; custo: number }[];
  byHour: { hour: string; mensagens: number }[];
  byAgent: AgentRow[];
  topHandoffs: { from: string; to: string; motivo: string; count: number }[];
  criticFailRate: number;
};

function rangeStart(range: AgentHQRange): Date {
  const d = new Date();
  if (range === "month") { d.setDate(1); d.setHours(0, 0, 0, 0); return d; }
  const days = range === "7d" ? 7 : 30;
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function useAgentHQ(range: AgentHQRange = "30d") {
  const [data, setData] = useState<HQData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const start = rangeStart(range);
    const startISO = start.toISOString();

    const [convsRes, msgsRes, agentsRes, handoffsRes, criticsRes] = await Promise.all([
      supabase.from("agent_conversations")
        .select("agent_slug, total_tokens_in, total_tokens_out, custo_estimado, status, transferida_para, iniciada_em, encerrada_em, ultima_atividade, balao_count, critic_fails, lead_id, conversation_state")
        .gte("iniciada_em", startISO),
      supabase.from("agent_messages").select("created_at, conversation_id").gte("created_at", startISO),
      supabase.from("agents_config").select("slug, nome, ativo"),
      supabase.from("agent_handoffs").select("from_agent, to_agent, motivo").gte("created_at", startISO),
      supabase.from("agent_critic_log").select("regenerou").gte("created_at", startISO),
    ]);

    const convs = convsRes.data || [];
    const msgs = msgsRes.data || [];
    const agents = agentsRes.data || [];
    const handoffs = handoffsRes.data || [];
    const critics = criticsRes.data || [];

    // Totals
    const totals = {
      conversas: convs.length,
      mensagens: msgs.length,
      custo: convs.reduce((s: number, c: any) => s + Number(c.custo_estimado || 0), 0),
      tokens_in: convs.reduce((s: number, c: any) => s + (c.total_tokens_in || 0), 0),
      tokens_out: convs.reduce((s: number, c: any) => s + (c.total_tokens_out || 0), 0),
      qualificacao_pct: 0,
      custo_por_conv: 0,
      leads_gerados: convs.filter((c: any) => c.lead_id).length,
      custo_por_lead: 0,
    };
    const qualificadasTotal = convs.filter((c: any) => {
      const st = (c.conversation_state || {}) as any;
      return c.status === "qualificada" || st.qualificado === true;
    }).length;
    totals.qualificacao_pct = totals.conversas ? (qualificadasTotal / totals.conversas) * 100 : 0;
    totals.custo_por_conv = totals.conversas ? totals.custo / totals.conversas : 0;
    totals.custo_por_lead = totals.leads_gerados ? totals.custo / totals.leads_gerados : 0;

    // By Day
    const days: Record<string, { mensagens: number; conversas: number; custo: number }> = {};
    const numDays = range === "7d" ? 7 : 30;
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = { mensagens: 0, conversas: 0, custo: 0 };
    }
    msgs.forEach((m: any) => {
      const k = m.created_at.slice(0, 10);
      if (days[k]) days[k].mensagens++;
    });
    convs.forEach((c: any) => {
      const k = c.iniciada_em.slice(0, 10);
      if (days[k]) {
        days[k].conversas++;
        days[k].custo += Number(c.custo_estimado || 0);
      }
    });
    const byDay = Object.entries(days).map(([day, v]) => ({ day: day.slice(5), ...v }));

    // By Hour
    const hours: Record<string, number> = {};
    for (let h = 0; h < 24; h++) hours[String(h).padStart(2, "0")] = 0;
    msgs.forEach((m: any) => {
      const h = String(new Date(m.created_at).getHours()).padStart(2, "0");
      hours[h]++;
    });
    const byHour = Object.entries(hours).map(([hour, mensagens]) => ({ hour: `${hour}h`, mensagens }));

    // Per agent
    const agentMap: Record<string, AgentRow> = {};
    agents.forEach((a: any) => {
      agentMap[a.slug] = {
        slug: a.slug, nome: a.nome,
        conversas: 0, mensagens: 0, qualificadas: 0, transferidas: 0,
        encerradas: 0, ativas: 0, taxa_qualificacao: 0, taxa_transferencia: 0,
        custo: 0, custo_por_conv: 0, tokens_in: 0, tokens_out: 0,
        tempo_medio_min: 0, baloes_medio: 0, critic_fails: 0,
      };
    });
    const tempos: Record<string, number[]> = {};
    const baloes: Record<string, number[]> = {};
    const msgPerConv: Record<string, number> = {};
    msgs.forEach((m: any) => { msgPerConv[m.conversation_id] = (msgPerConv[m.conversation_id] || 0) + 1; });

    convs.forEach((c: any) => {
      const slug = c.agent_slug;
      if (!agentMap[slug]) {
        agentMap[slug] = { slug, nome: slug, conversas: 0, mensagens: 0, qualificadas: 0, transferidas: 0, encerradas: 0, ativas: 0, taxa_qualificacao: 0, taxa_transferencia: 0, custo: 0, custo_por_conv: 0, tokens_in: 0, tokens_out: 0, tempo_medio_min: 0, baloes_medio: 0, critic_fails: 0 };
      }
      const r = agentMap[slug];
      r.conversas++;
      r.custo += Number(c.custo_estimado || 0);
      r.tokens_in += c.total_tokens_in || 0;
      r.tokens_out += c.total_tokens_out || 0;
      r.critic_fails += c.critic_fails || 0;
      if (c.status === "ativa") r.ativas++;
      if (c.status === "encerrada") r.encerradas++;
      const st = (c.conversation_state || {}) as any;
      if (c.status === "qualificada" || st.qualificado === true) r.qualificadas++;
      if (c.transferida_para) r.transferidas++;

      const ini = new Date(c.iniciada_em).getTime();
      const fim = new Date(c.encerrada_em || c.ultima_atividade).getTime();
      const min = Math.max(0, (fim - ini) / 60000);
      (tempos[slug] ||= []).push(min);
      if (c.balao_count) (baloes[slug] ||= []).push(c.balao_count);
    });

    Object.values(agentMap).forEach((r) => {
      r.taxa_qualificacao = r.conversas ? (r.qualificadas / r.conversas) * 100 : 0;
      r.taxa_transferencia = r.conversas ? (r.transferidas / r.conversas) * 100 : 0;
      r.custo_por_conv = r.conversas ? r.custo / r.conversas : 0;
      const t = tempos[r.slug] || [];
      r.tempo_medio_min = t.length ? t.reduce((a, b) => a + b, 0) / t.length : 0;
      const b = baloes[r.slug] || [];
      r.baloes_medio = b.length ? b.reduce((a, b) => a + b, 0) / b.length : 0;
    });
    Object.entries(msgPerConv).forEach(([convId, count]) => {
      const conv = convs.find((c: any) => c.id === convId);
      if (conv && agentMap[conv.agent_slug]) agentMap[conv.agent_slug].mensagens += count;
    });
    // Fallback: assign all messages by agent_slug count if join missed
    const byAgent = Object.values(agentMap)
      .filter((r) => r.conversas > 0)
      .sort((a, b) => b.conversas - a.conversas);

    // Handoffs
    const handoffMap: Record<string, { from: string; to: string; motivo: string; count: number }> = {};
    handoffs.forEach((h: any) => {
      const k = `${h.from_agent}>${h.to_agent}|${h.motivo}`;
      if (!handoffMap[k]) handoffMap[k] = { from: h.from_agent, to: h.to_agent, motivo: h.motivo, count: 0 };
      handoffMap[k].count++;
    });
    const topHandoffs = Object.values(handoffMap).sort((a, b) => b.count - a.count).slice(0, 6);

    const regenerated = critics.filter((c: any) => c.regenerou).length;
    const criticFailRate = critics.length ? (regenerated / critics.length) * 100 : 0;

    setData({ totals, byDay, byHour, byAgent, topHandoffs, criticFailRate });
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, reload: load };
}