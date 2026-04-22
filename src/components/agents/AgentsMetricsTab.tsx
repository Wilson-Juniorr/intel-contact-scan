import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, MessageCircle, Bot, TrendingUp, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";

type Stats = {
  totalConvs: number;
  totalMessages: number;
  totalCost: number;
  totalTokensIn: number;
  totalTokensOut: number;
  byAgent: { agent: string; count: number; cost: number }[];
  byDay: { day: string; messages: number }[];
};

export function AgentsMetricsTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

      const { data: convs } = await supabase
        .from("agent_conversations")
        .select("agent_slug, total_tokens_in, total_tokens_out, custo_estimado")
        .gte("iniciada_em", monthStart.toISOString());

      const { data: msgs } = await supabase
        .from("agent_messages")
        .select("created_at")
        .gte("created_at", monthStart.toISOString());

      const totalConvs = convs?.length || 0;
      const totalCost = (convs || []).reduce((s, c: any) => s + Number(c.custo_estimado || 0), 0);
      const totalTokensIn = (convs || []).reduce((s, c: any) => s + (c.total_tokens_in || 0), 0);
      const totalTokensOut = (convs || []).reduce((s, c: any) => s + (c.total_tokens_out || 0), 0);
      const totalMessages = msgs?.length || 0;

      const byAgentMap: Record<string, { count: number; cost: number }> = {};
      (convs || []).forEach((c: any) => {
        if (!byAgentMap[c.agent_slug]) byAgentMap[c.agent_slug] = { count: 0, cost: 0 };
        byAgentMap[c.agent_slug].count++;
        byAgentMap[c.agent_slug].cost += Number(c.custo_estimado || 0);
      });
      const byAgent = Object.entries(byAgentMap).map(([agent, v]) => ({ agent, ...v }));

      const byDayMap: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        byDayMap[d.toISOString().split("T")[0]] = 0;
      }
      (msgs || []).forEach((m: any) => {
        const d = m.created_at.split("T")[0];
        if (d in byDayMap) byDayMap[d]++;
      });
      const byDay = Object.entries(byDayMap).map(([day, messages]) => ({ day: day.slice(5), messages }));

      setStats({ totalConvs, totalMessages, totalCost, totalTokensIn, totalTokensOut, byAgent, byDay });
      setLoading(false);
    })();
  }, []);

  if (loading || !stats) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const cards = [
    { label: "Conversas (mês)", value: stats.totalConvs.toString(), icon: MessageCircle, gradient: "gradient-card-blue" },
    { label: "Mensagens (mês)", value: stats.totalMessages.toString(), icon: Bot, gradient: "gradient-card-green" },
    { label: "Custo IA (mês)", value: `$${stats.totalCost.toFixed(4)}`, icon: DollarSign, gradient: "gradient-card-amber" },
    { label: "Tokens (in/out)", value: `${(stats.totalTokensIn / 1000).toFixed(1)}K / ${(stats.totalTokensOut / 1000).toFixed(1)}K`, icon: TrendingUp, gradient: "gradient-card-blue" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className={`${c.gradient} hover-card-lift border-border/50`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{c.label}</p>
                  <c.icon className="h-4 w-4 text-primary" />
                </div>
                <p className="text-xl font-bold">{c.value}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Mensagens por dia (últimos 7)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.byDay}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="messages" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Performance por agent</h3>
          {stats.byAgent.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem conversas este mês</p>
          ) : (
            <div className="space-y-2">
              {stats.byAgent.map((a) => (
                <div key={a.agent} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{a.agent}</span>
                  <span className="text-muted-foreground">{a.count} conv · ${a.cost.toFixed(4)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
