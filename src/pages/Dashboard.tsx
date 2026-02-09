import { useMemo } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { FUNNEL_STAGES } from "@/types/lead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Handshake, TrendingUp, AlertTriangle, Phone } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Dashboard() {
  const { leads } = useLeadsContext();

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const newToday = leads.filter((l) => new Date(l.created_at) >= today).length;
    const newWeek = leads.filter((l) => new Date(l.created_at) >= weekAgo).length;
    const negotiating = leads.filter((l) => l.stage === "cotacao_enviada" || l.stage === "cotacao_aprovada").length;
    const converted = leads.filter((l) => l.stage === "implantado").length;
    const lost = leads.filter((l) => l.stage === "cancelado" || l.stage === "declinado").length;

    const needsFollowUp = leads.filter((l) => {
      if (l.stage === "implantado" || l.stage === "cancelado" || l.stage === "declinado") return false;
      if (!l.last_contact_at) return true;
      const daysSince = (Date.now() - new Date(l.last_contact_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince >= 2;
    });

    return { total: leads.length, newToday, newWeek, negotiating, converted, lost, needsFollowUp };
  }, [leads]);

  const funnelData = useMemo(() => {
    return FUNNEL_STAGES.filter((s) => s.key !== "cancelado" && s.key !== "declinado").map((stage) => ({
      name: stage.label,
      value: leads.filter((l) => l.stage === stage.key).length,
      color: stage.color,
    }));
  }, [leads]);

  const recentLeads = useMemo(() => {
    return [...leads].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5);
  }, [leads]);

  const statCards = [
    { label: "Total de Leads", value: stats.total, icon: Users, accent: "text-primary" },
    { label: "Novos (semana)", value: stats.newWeek, icon: UserPlus, accent: "text-primary" },
    { label: "Em Cotação", value: stats.negotiating, icon: Handshake, accent: "text-warning" },
    { label: "Implantados", value: stats.converted, icon: TrendingUp, accent: "text-secondary" },
    { label: "Cancelados", value: stats.lost, icon: AlertTriangle, accent: "text-destructive" },
    { label: "Follow-up", value: stats.needsFollowUp.length, icon: Phone, accent: "text-warning" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Visão geral dos seus leads</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <Card key={s.label} className="bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <s.icon className={`h-5 w-5 ${s.accent}`} />
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Funil de Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {funnelData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Leads Recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentLeads.map((lead) => {
              const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);
              return (
                <div key={lead.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{lead.name}</p>
                    <p className="text-xs text-muted-foreground">{lead.phone}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] px-2" style={{ borderColor: stageInfo?.color, color: stageInfo?.color }}>
                      {stageInfo?.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {stats.needsFollowUp.length > 0 && (
        <Card className="border-warning/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="h-5 w-5 text-warning" />
              Leads que precisam de follow-up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.needsFollowUp.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between py-1">
                <div>
                  <span className="text-sm font-medium">{lead.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{lead.phone}</span>
                </div>
                <span className="text-xs text-warning">
                  {lead.last_contact_at
                    ? `Sem contato há ${formatDistanceToNow(new Date(lead.last_contact_at), { locale: ptBR })}`
                    : "Nunca contatado"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
