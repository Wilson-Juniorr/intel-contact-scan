import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, DollarSign, Loader2, Brain, Activity } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function AIUsagePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [savingSettings, setSavingSettings] = useState(false);
  const [dailyLimit, setDailyLimit] = useState("500000");
  const [aiEnabled, setAiEnabled] = useState(true);

  // Load settings
  const settingsQuery = useQuery({
    queryKey: ["user_settings", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setDailyLimit(String(settingsQuery.data.daily_token_limit || 500000));
      setAiEnabled(settingsQuery.data.ai_enabled ?? true);
    }
  }, [settingsQuery.data]);

  // Today's usage
  const todayQuery = useQuery({
    queryKey: ["api_usage_today", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("api_usage")
        .select("input_tokens, output_tokens, estimated_cost_usd, function_name")
        .eq("user_id", user!.id)
        .gte("created_at", today);
      return data || [];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Monthly usage
  const monthQuery = useQuery({
    queryKey: ["api_usage_month", user?.id],
    queryFn: async () => {
      const firstDay = new Date();
      firstDay.setDate(1);
      firstDay.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("api_usage")
        .select("input_tokens, output_tokens, estimated_cost_usd, created_at")
        .eq("user_id", user!.id)
        .gte("created_at", firstDay.toISOString());
      return data || [];
    },
    enabled: !!user,
  });

  // Last 7 days chart data
  const weeklyQuery = useQuery({
    queryKey: ["api_usage_weekly", user?.id],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("api_usage")
        .select("input_tokens, output_tokens, estimated_cost_usd, created_at")
        .eq("user_id", user!.id)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });

  // Recent calls
  const recentQuery = useQuery({
    queryKey: ["api_usage_recent", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("api_usage")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!user,
  });

  const todayTokens = (todayQuery.data || []).reduce(
    (sum, r) => sum + (r.input_tokens || 0) + (r.output_tokens || 0),
    0
  );
  const todayCost = (todayQuery.data || []).reduce(
    (sum, r) => sum + Number(r.estimated_cost_usd || 0),
    0
  );
  const monthTokens = (monthQuery.data || []).reduce(
    (sum, r) => sum + (r.input_tokens || 0) + (r.output_tokens || 0),
    0
  );
  const monthCost = (monthQuery.data || []).reduce(
    (sum, r) => sum + Number(r.estimated_cost_usd || 0),
    0
  );
  const limit = Number(dailyLimit) || 500000;
  const pctUsed = Math.min(100, Math.round((todayTokens / limit) * 100));

  // Group weekly data by day
  const chartData = (() => {
    const days: Record<string, { tokens: number; cost: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" });
      const dateKey = d.toISOString().split("T")[0];
      days[dateKey] = { tokens: 0, cost: 0 };
    }
    for (const row of weeklyQuery.data || []) {
      const dateKey = new Date(row.created_at).toISOString().split("T")[0];
      if (days[dateKey]) {
        days[dateKey].tokens += (row.input_tokens || 0) + (row.output_tokens || 0);
        days[dateKey].cost += Number(row.estimated_cost_usd || 0);
      }
    }
    return Object.entries(days).map(([date, val]) => ({
      name: new Date(date).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }),
      tokens: Math.round(val.tokens / 1000),
      custo: Number(val.cost.toFixed(4)),
    }));
  })();

  const handleSaveSettings = async () => {
    if (!user) return;
    setSavingSettings(true);
    try {
      const { error } = await supabase.from("user_settings").upsert(
        {
          user_id: user.id,
          daily_token_limit: Number(dailyLimit) || 500000,
          ai_enabled: aiEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["user_settings"] });
      toast.success("Configurações salvas!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
    setSavingSettings(false);
  };

  const fnLabels: Record<string, string> = {
    chat: "Assistente IA",
    "follow-up-message": "Follow-up",
    "rewrite-message": "Reescrita",
    "lead-summary": "Resumo IA",
    "next-best-action": "Próxima Ação",
    "update-lead-memory": "Memória",
    "suggest-tasks": "Sugestão Tarefas",
    "closing-engine": "Fechamento",
    "extract-quote-data": "Cotação",
    "process-message-media": "Mídia",
    "analyze-media": "Análise Mídia",
    "ocr-extract": "OCR",
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Brain className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Uso de IA</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" /> Uso Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(todayTokens / 1000).toFixed(1)}K tokens</p>
            <Progress value={pctUsed} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {pctUsed}% do limite ({(limit / 1000).toFixed(0)}K)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Uso do Mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(monthTokens / 1000).toFixed(1)}K tokens</p>
            <p className="text-sm text-muted-foreground mt-1">
              {(todayQuery.data || []).length} chamadas hoje
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" /> Custo Estimado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">$ {monthCost.toFixed(4)}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Hoje: $ {todayCost.toFixed(4)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Últimos 7 dias (tokens em K)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number, name: string) =>
                    name === "tokens" ? [`${v}K tokens`, "Tokens"] : [`$${v}`, "Custo"]
                  }
                />
                <Bar dataKey="tokens" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Configurações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">IA Habilitada</span>
              <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Limite diário (tokens)</label>
              <Input
                type="number"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={handleSaveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent calls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Últimas 20 chamadas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {(recentQuery.data || []).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhuma chamada registrada ainda
              </p>
            )}
            {(recentQuery.data || []).map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Sparkles className="h-3 w-3 text-primary shrink-0" />
                  <span className="font-medium truncate">
                    {fnLabels[row.function_name] || row.function_name}
                  </span>
                  <Badge variant="outline" className="text-[9px]">
                    {row.model || "flash-lite"}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                  <span>{((row.input_tokens || 0) + (row.output_tokens || 0)).toLocaleString()} tok</span>
                  <span>$ {Number(row.estimated_cost_usd || 0).toFixed(5)}</span>
                  <span>{new Date(row.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
