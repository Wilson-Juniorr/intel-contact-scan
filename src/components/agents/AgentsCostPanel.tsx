import { useState } from "react";
import { useAgentCosts, type CostRange, type AgentCostRow } from "@/hooks/useAgentCosts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, TrendingUp, AlertTriangle, Settings, Wallet, Zap, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { BudgetDialog } from "./BudgetDialog";

function fmtUSD(v: number) {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

function statusColor(s: AgentCostRow["status"]) {
  if (s === "exceeded") return "bg-destructive/15 text-destructive border-destructive/30";
  if (s === "warn") return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
  return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
}

function progressColor(pct: number, warnAt: number) {
  if (pct >= 100) return "bg-destructive";
  if (pct >= warnAt) return "bg-amber-500";
  return "bg-emerald-500";
}

export function AgentsCostPanel() {
  const [range, setRange] = useState<CostRange>("30d");
  const { data, loading, reload, saveBudget } = useAgentCosts(range);
  const [editing, setEditing] = useState<{ slug: string; nome: string; budget?: any } | null>(null);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const t = data.totals;
  const globalUsedPct = data.globalBudget
    ? (data.totals.custo_mes / data.globalBudget.monthly_limit_usd) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" /> Painel de Custo de IA
          </h2>
          <p className="text-sm text-muted-foreground">Controle de gastos, orçamentos e alertas por agent</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as CostRange)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => reload()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={() => setEditing({ slug: "*", nome: "Orçamento Global", budget: data.globalBudget })}>
            <Settings className="h-4 w-4 mr-2" /> Orçamento global
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Gasto no período</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />{fmtUSD(t.custo_periodo)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Gasto hoje</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtUSD(t.custo_hoje)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Gasto este mês</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />{fmtUSD(t.custo_mes)}
            </div>
            {data.globalBudget && (
              <div className="mt-2 space-y-1">
                <Progress value={Math.min(100, globalUsedPct)} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {globalUsedPct.toFixed(0)}% de {fmtUSD(data.globalBudget.monthly_limit_usd)} (orçamento global)
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Conversas no período</CardDescription></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-500" />{t.conversas}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t.conversas ? fmtUSD(t.custo_periodo / t.conversas) : "—"} / conversa
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trend chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evolução do gasto diário</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.byDay}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `$${v.toFixed(2)}`} />
                <Tooltip
                  formatter={(v: number) => fmtUSD(v)}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Area type="monotone" dataKey="custo" stroke="hsl(var(--primary))" fill="url(#costGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Per-agent budgets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orçamento por agent</CardTitle>
          <CardDescription>Acompanhe o consumo diário e mensal vs limites configurados</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum agent com atividade ainda.</p>
          )}
          {data.rows.map((r) => (
            <div key={r.agent_slug} className="rounded-lg border p-4 space-y-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{r.nome}</p>
                  <Badge variant="outline" className={statusColor(r.status)}>
                    {r.status === "exceeded" ? "Excedido" : r.status === "warn" ? "Atenção" : "OK"}
                  </Badge>
                  {!r.budget && <Badge variant="outline" className="text-xs">Sem orçamento</Badge>}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">{r.conversas} conversas</span>
                  <span className="font-semibold">{fmtUSD(r.custo_periodo)}</span>
                  <Button variant="ghost" size="sm" onClick={() => setEditing({ slug: r.agent_slug, nome: r.nome, budget: r.budget })}>
                    <Settings className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {r.budget && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Hoje</span>
                      <span>{fmtUSD(r.custo_hoje)} / {fmtUSD(r.budget.daily_limit_usd)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded overflow-hidden">
                      <div
                        className={`h-full transition-all ${progressColor(r.pct_dia, r.budget.warn_at_pct)}`}
                        style={{ width: `${Math.min(100, r.pct_dia)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{r.pct_dia.toFixed(0)}%</p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Mês</span>
                      <span>{fmtUSD(r.custo_mes)} / {fmtUSD(r.budget.monthly_limit_usd)}</span>
                    </div>
                    <div className="h-2 bg-muted rounded overflow-hidden">
                      <div
                        className={`h-full transition-all ${progressColor(r.pct_mes, r.budget.warn_at_pct)}`}
                        style={{ width: `${Math.min(100, r.pct_mes)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{r.pct_mes.toFixed(0)}%</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>tokens in: {r.tokens_in.toLocaleString()}</span>
                <span>tokens out: {r.tokens_out.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.alerts.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm p-2 rounded border">
                <div>
                  <span className="font-medium">{a.agent_slug}</span>
                  <span className="text-muted-foreground ml-2">{a.tipo} — {a.periodo}</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold">{Number(a.pct_consumido).toFixed(0)}%</span>
                  <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {editing && (
        <BudgetDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          agentSlug={editing.slug}
          agentName={editing.nome}
          initial={editing.budget}
          onSave={saveBudget}
        />
      )}
    </div>
  );
}