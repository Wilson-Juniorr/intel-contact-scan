import { useMemo, useState } from "react";
import { Lead, FUNNEL_STAGES } from "@/types/lead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, PieChart, Pie } from "recharts";

interface DashboardMetricsProps {
  leads: Lead[];
}

export function DashboardMetrics({ leads }: DashboardMetricsProps) {
  const [period, setPeriod] = useState("30");

  const filteredLeads = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(period));
    return leads.filter(l => new Date(l.created_at) >= cutoff);
  }, [leads, period]);

  // Conversion by stage
  const conversionData = useMemo(() => {
    const stages = FUNNEL_STAGES.filter(s => s.key !== "cancelado" && s.key !== "declinado");
    const stageOrder = stages.map(s => s.key);
    return stages.map((stage, i) => {
      const count = leads.filter(l => {
        const idx = stageOrder.indexOf(l.stage);
        return idx >= i;
      }).length;
      const total = leads.length || 1;
      return { name: stage.label.split(" ").slice(0, 2).join(" "), count, pct: Math.round((count / total) * 100), color: stage.color };
    });
  }, [leads]);

  // Pipeline value
  const pipelineValue = useMemo(() => {
    return leads.reduce((sum, lead) => {
      const stage = FUNNEL_STAGES.find(s => s.key === lead.stage);
      const value = lead.approved_value || lead.quote_min_value || ((lead.lives || 1) * 120);
      return sum + (value * (stage?.weight || 0) / 100);
    }, 0);
  }, [leads]);

  // Leads by type
  const byType = useMemo(() => {
    const counts: Record<string, number> = { PF: 0, PJ: 0, PME: 0 };
    leads.forEach(l => { counts[l.type] = (counts[l.type] || 0) + 1; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [leads]);

  // Leads by week (last 12 weeks)
  const weeklyData = useMemo(() => {
    const weeks: { label: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = new Date(); start.setDate(start.getDate() - (i + 1) * 7);
      const end = new Date(); end.setDate(end.getDate() - i * 7);
      const count = leads.filter(l => { const d = new Date(l.created_at); return d >= start && d < end; }).length;
      weeks.push({ label: `S${12 - i}`, count });
    }
    return weeks;
  }, [leads]);

  const COLORS = ["hsl(199, 89%, 48%)", "hsl(150, 60%, 38%)", "hsl(35, 85%, 50%)"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Métricas</h2>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Receita Projetada</p>
            <p className="text-2xl font-bold">R$ {pipelineValue.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}</p>
            <p className="text-xs text-muted-foreground">Pipeline ponderado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Novos no período</p>
            <p className="text-2xl font-bold">{filteredLeads.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Taxa de Conversão</p>
            <p className="text-2xl font-bold">
              {leads.length > 0 ? Math.round((leads.filter(l => l.stage === "implantado").length / leads.length) * 100) : 0}%
            </p>
            <p className="text-xs text-muted-foreground">Novos → Implantados</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Conversão por Estágio</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={conversionData} layout="vertical" margin={{ left: 5 }}>
                <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip formatter={(v: number) => [`${v}%`, "Conversão"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                  {conversionData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Leads por Semana</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={weeklyData}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {byType.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Leads por Tipo</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byType} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
