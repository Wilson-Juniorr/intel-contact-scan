import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CostRange = "today" | "7d" | "30d" | "month";

export type Budget = {
  id: string;
  agent_slug: string;
  daily_limit_usd: number;
  monthly_limit_usd: number;
  warn_at_pct: number;
  pause_on_exceed: boolean;
  ativo: boolean;
};

export type AgentCostRow = {
  agent_slug: string;
  nome: string;
  custo_periodo: number;
  custo_hoje: number;
  custo_mes: number;
  conversas: number;
  tokens_in: number;
  tokens_out: number;
  budget?: Budget;
  pct_dia: number;
  pct_mes: number;
  status: "ok" | "warn" | "exceeded";
};

export type CostData = {
  rows: AgentCostRow[];
  totals: { custo_periodo: number; custo_hoje: number; custo_mes: number; conversas: number };
  byDay: { day: string; custo: number }[];
  byModel: { modelo: string; custo: number; tokens: number }[];
  alerts: { id: string; agent_slug: string; periodo: string; pct_consumido: number; tipo: string; created_at: string }[];
  globalBudget?: Budget;
};

function rangeStart(r: CostRange): Date {
  const d = new Date();
  if (r === "today") { d.setHours(0, 0, 0, 0); return d; }
  if (r === "month") { d.setDate(1); d.setHours(0, 0, 0, 0); return d; }
  d.setDate(d.getDate() - (r === "7d" ? 7 : 30));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function useAgentCosts(range: CostRange = "30d") {
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const startISO = rangeStart(range).toISOString();
    const todayISO = rangeStart("today").toISOString();
    const monthISO = rangeStart("month").toISOString();

    const [convsRes, agentsRes, budgetsRes, alertsRes] = await Promise.all([
      supabase.from("agent_conversations")
        .select("agent_slug, custo_estimado, total_tokens_in, total_tokens_out, iniciada_em")
        .gte("iniciada_em", monthISO),
      supabase.from("agents_config").select("slug, nome"),
      supabase.from("agent_budgets").select("*"),
      supabase.from("agent_budget_alerts").select("*").order("created_at", { ascending: false }).limit(20),
    ]);

    const convs = convsRes.data || [];
    const agents = agentsRes.data || [];
    const budgets = (budgetsRes.data || []) as Budget[];
    const alerts = alertsRes.data || [];

    const globalBudget = budgets.find((b) => b.agent_slug === "*");
    const budgetMap: Record<string, Budget> = {};
    budgets.forEach((b) => { budgetMap[b.agent_slug] = b; });

    const rows: Record<string, AgentCostRow> = {};
    agents.forEach((a: any) => {
      const budget = budgetMap[a.slug] || globalBudget;
      rows[a.slug] = {
        agent_slug: a.slug, nome: a.nome,
        custo_periodo: 0, custo_hoje: 0, custo_mes: 0,
        conversas: 0, tokens_in: 0, tokens_out: 0,
        budget, pct_dia: 0, pct_mes: 0, status: "ok",
      };
    });

    let totalPeriodo = 0, totalHoje = 0, totalMes = 0, totalConvs = 0;
    const days: Record<string, number> = {};
    const startDate = new Date(startISO);
    const numDays = range === "today" ? 1 : range === "7d" ? 7 : 30;
    for (let i = 0; i < numDays; i++) {
      const d = new Date(startDate); d.setDate(d.getDate() + i);
      days[d.toISOString().slice(0, 10)] = 0;
    }

    convs.forEach((c: any) => {
      const slug = c.agent_slug;
      const cost = Number(c.custo_estimado || 0);
      if (!rows[slug]) {
        rows[slug] = {
          agent_slug: slug, nome: slug,
          custo_periodo: 0, custo_hoje: 0, custo_mes: 0,
          conversas: 0, tokens_in: 0, tokens_out: 0,
          budget: budgetMap[slug] || globalBudget, pct_dia: 0, pct_mes: 0, status: "ok",
        };
      }
      const r = rows[slug];
      const inPeriodo = c.iniciada_em >= startISO;
      const inHoje = c.iniciada_em >= todayISO;
      r.custo_mes += cost;
      totalMes += cost;
      if (inPeriodo) {
        r.custo_periodo += cost;
        r.conversas++;
        r.tokens_in += c.total_tokens_in || 0;
        r.tokens_out += c.total_tokens_out || 0;
        totalPeriodo += cost;
        totalConvs++;
        const k = c.iniciada_em.slice(0, 10);
        if (days[k] !== undefined) days[k] += cost;
      }
      if (inHoje) {
        r.custo_hoje += cost;
        totalHoje += cost;
      }
    });

    Object.values(rows).forEach((r) => {
      if (r.budget) {
        r.pct_dia = r.budget.daily_limit_usd > 0 ? (r.custo_hoje / r.budget.daily_limit_usd) * 100 : 0;
        r.pct_mes = r.budget.monthly_limit_usd > 0 ? (r.custo_mes / r.budget.monthly_limit_usd) * 100 : 0;
        const max = Math.max(r.pct_dia, r.pct_mes);
        if (max >= 100) r.status = "exceeded";
        else if (max >= r.budget.warn_at_pct) r.status = "warn";
      }
    });

    const sortedRows = Object.values(rows)
      .filter((r) => r.conversas > 0 || r.budget)
      .sort((a, b) => b.custo_periodo - a.custo_periodo);

    const byDay = Object.entries(days).map(([day, custo]) => ({ day: day.slice(5), custo }));
    const byModel: { modelo: string; custo: number; tokens: number }[] = [];

    setData({
      rows: sortedRows,
      totals: { custo_periodo: totalPeriodo, custo_hoje: totalHoje, custo_mes: totalMes, conversas: totalConvs },
      byDay,
      byModel,
      alerts,
      globalBudget,
    });
    setLoading(false);
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const saveBudget = useCallback(async (budget: Partial<Budget> & { agent_slug: string }) => {
    const { error } = await supabase.from("agent_budgets")
      .upsert(budget as any, { onConflict: "agent_slug" });
    if (error) throw error;
    await load();
  }, [load]);

  return { data, loading, reload: load, saveBudget };
}