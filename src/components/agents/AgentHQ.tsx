import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAgentHQ, AgentHQRange } from "@/hooks/useAgentHQ";
import {
  DollarSign, MessageCircle, Bot, TrendingUp, Loader2, Users, Target,
  ArrowRightLeft, Zap, Clock, AlertCircle, RefreshCw, Trophy
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from "recharts";
import { motion } from "framer-motion";

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

export function AgentHQ() {
  const [range, setRange] = useState<AgentHQRange>("30d");
  const { data, loading, reload } = useAgentHQ(range);

  if (loading || !data) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const t = data.totals;
  const cards = [
    { label: "Conversas", value: t.conversas.toLocaleString("pt-BR"), icon: MessageCircle, color: "text-blue-500" },
    { label: "Mensagens", value: t.mensagens.toLocaleString("pt-BR"), icon: Bot, color: "text-purple-500" },
    { label: "Leads gerados", value: t.leads_gerados.toLocaleString("pt-BR"), icon: Users, color: "text-emerald-500" },
    { label: "Taxa qualificação", value: `${t.qualificacao_pct.toFixed(1)}%`, icon: Target, color: "text-amber-500" },
    { label: "Custo IA", value: `$${t.custo.toFixed(4)}`, icon: DollarSign, color: "text-rose-500" },
    { label: "Custo / conversa", value: `$${t.custo_por_conv.toFixed(5)}`, icon: TrendingUp, color: "text-cyan-500" },
    { label: "Custo / lead", value: t.custo_por_lead ? `$${t.custo_por_lead.toFixed(4)}` : "—", icon: Zap, color: "text-violet-500" },
    { label: "Crítico regenerou", value: `${data.criticFailRate.toFixed(1)}%`, icon: AlertCircle, color: "text-orange-500" },
  ];

  return (
    <div className="space-y-4">
      {/* Header / range selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" /> Agent HQ
          </h2>
          <p className="text-xs text-muted-foreground">Performance, custo e qualidade dos agents</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(v: AgentHQRange) => setRange(v)}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={reload} className="h-8"><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="hover-card-lift border-border/50">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{c.label}</p>
                  <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                </div>
                <p className="text-lg font-bold tabular-nums">{c.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Volume diário</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data.byDay}>
                <defs>
                  <linearGradient id="m" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="mensagens" stroke="hsl(var(--primary))" fill="url(#m)" strokeWidth={2} />
                <Line type="monotone" dataKey="conversas" stroke="hsl(var(--accent-foreground))" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Heatmap por hora</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.byHour}>
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="mensagens" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Ranking */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-amber-500" /> Ranking de agents</h3>
            <span className="text-[10px] text-muted-foreground">{data.byAgent.length} ativos</span>
          </div>
          {data.byAgent.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Sem conversas no período</p>
          ) : (
            <div className="space-y-2">
              {data.byAgent.map((a, i) => (
                <div key={a.slug} className="border border-border/50 rounded-lg p-3 hover:border-border transition">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] font-mono">#{i + 1}</Badge>
                      <span className="font-semibold text-sm">{a.nome}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{a.slug}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                      <span>{a.conversas} conv</span>
                      <span>•</span>
                      <span>${a.custo.toFixed(4)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-[11px]">
                    <KpiBar label="Qualificação" value={a.taxa_qualificacao} suffix="%" color="bg-emerald-500" />
                    <KpiBar label="Transferência" value={a.taxa_transferencia} suffix="%" color="bg-amber-500" />
                    <Mini label="Custo/conv" value={`$${a.custo_por_conv.toFixed(5)}`} />
                    <Mini label="Tempo médio" value={`${a.tempo_medio_min.toFixed(1)} min`} />
                    <Mini label="Balões médio" value={a.baloes_medio.toFixed(1)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Handoffs */}
      {data.topHandoffs.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1"><ArrowRightLeft className="h-3.5 w-3.5" /> Top transferências</h3>
            <div className="space-y-2">
              {data.topHandoffs.map((h, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px]">{h.from}</Badge>
                    <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="outline" className="font-mono text-[10px]">{h.to}</Badge>
                    <span className="text-muted-foreground italic">"{h.motivo}"</span>
                  </div>
                  <span className="font-semibold tabular-nums">{h.count}x</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiBar({ label, value, suffix, color }: { label: string; value: number; suffix: string; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
        <span>{label}</span>
        <span className="font-semibold text-foreground tabular-nums">{value.toFixed(1)}{suffix}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xs font-semibold tabular-nums">{value}</p>
    </div>
  );
}