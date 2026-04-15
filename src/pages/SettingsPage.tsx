import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Save, Download, Eye, EyeOff } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useLeadsContext } from "@/contexts/LeadsContext";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="text-muted-foreground text-sm">Gerencie seu perfil, integrações e dados</p>
      </div>
      <Tabs defaultValue="profile">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">Perfil</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="ai">IA</TabsTrigger>
          <TabsTrigger value="data">Dados</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        <TabsContent value="whatsapp"><WhatsAppTab /></TabsContent>
        <TabsContent value="ai"><AITab /></TabsContent>
        <TabsContent value="data"><DataTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("user_settings").select("display_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.display_name) setDisplayName(data.display_name); });
  }, [user]);

  const saveName = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from("user_settings").upsert({
      user_id: user.id,
      display_name: displayName,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSaving(false);
    toast.success("Nome atualizado");
  };

  const changePassword = async () => {
    if (newPassword.length < 6) { toast.error("Senha deve ter pelo menos 6 caracteres"); return; }
    if (newPassword !== confirmPassword) { toast.error("Senhas não conferem"); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { toast.error(error.message); return; }
    toast.success("Senha alterada com sucesso");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Perfil</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <div className="flex gap-2">
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Seu nome" />
              <Button onClick={saveName} disabled={saving} size="icon"><Save className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email || ""} disabled />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Alterar Senha</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Nova senha</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Confirmar nova senha</Label>
            <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </div>
          <Button onClick={changePassword} disabled={!newPassword}>Alterar senha</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function WhatsAppTab() {
  const [showToken, setShowToken] = useState(false);
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Integração WhatsApp (UaZapi)</CardTitle>
        <CardDescription>Configuração gerenciada pelo administrador do sistema</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>URL da API</Label>
          <Input value="Configurado no servidor" disabled />
        </div>
        <div className="space-y-2">
          <Label>Token</Label>
          <div className="flex gap-2">
            <Input type={showToken ? "text" : "password"} value="••••••••••••••••" disabled />
            <Button variant="outline" size="icon" onClick={() => setShowToken(!showToken)}>
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="text-sm text-muted-foreground">Conexão ativa</span>
        </div>
      </CardContent>
    </Card>
  );
}

function AITab() {
  const { user } = useAuth();
  const [settings, setSettings] = useState({ ai_enabled: true, daily_token_limit: 500000 });
  const [usage, setUsage] = useState({ today: 0, month: 0, costMonth: 0 });
  const [chartData, setChartData] = useState<{ day: string; tokens: number }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: s } = await supabase.from("user_settings").select("ai_enabled, daily_token_limit").eq("user_id", user.id).maybeSingle();
      if (s) setSettings({ ai_enabled: s.ai_enabled ?? true, daily_token_limit: s.daily_token_limit ?? 500000 });

      const today = new Date().toISOString().split("T")[0];
      const monthStart = today.slice(0, 7) + "-01";
      const { data: usageData } = await supabase.from("api_usage").select("input_tokens, output_tokens, estimated_cost_usd, created_at").eq("user_id", user.id).gte("created_at", monthStart);

      if (usageData) {
        const todayTokens = usageData.filter(r => r.created_at.startsWith(today)).reduce((s, r) => s + (r.input_tokens || 0) + (r.output_tokens || 0), 0);
        const monthTokens = usageData.reduce((s, r) => s + (r.input_tokens || 0) + (r.output_tokens || 0), 0);
        const monthCost = usageData.reduce((s, r) => s + (r.estimated_cost_usd || 0), 0);
        setUsage({ today: todayTokens, month: monthTokens, costMonth: monthCost });

        const byDay: Record<string, number> = {};
        for (let i = 6; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          byDay[d.toISOString().split("T")[0]] = 0;
        }
        usageData.forEach(r => { const d = r.created_at.split("T")[0]; if (d in byDay) byDay[d] += (r.input_tokens || 0) + (r.output_tokens || 0); });
        setChartData(Object.entries(byDay).map(([day, tokens]) => ({ day: day.slice(5), tokens })));
      }
    };
    load();
  }, [user]);

  const saveSettings = async () => {
    if (!user) return;
    setSaving(true);
    await supabase.from("user_settings").upsert({
      user_id: user.id, ...settings,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSaving(false);
    toast.success("Configurações de IA salvas");
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Tokens hoje</p>
          <p className="text-xl font-bold">{(usage.today / 1000).toFixed(1)}K</p>
          <Progress value={(usage.today / settings.daily_token_limit) * 100} className="h-1.5 mt-2" />
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Tokens no mês</p>
          <p className="text-xl font-bold">{(usage.month / 1000).toFixed(1)}K</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Custo estimado (mês)</p>
          <p className="text-xl font-bold">${usage.costMonth.toFixed(4)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Uso nos últimos 7 dias</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
              <Tooltip formatter={(v: number) => [`${(v / 1000).toFixed(1)}K tokens`, "Uso"]}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="tokens" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Controles</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>IA habilitada</Label>
            <Switch checked={settings.ai_enabled} onCheckedChange={v => setSettings(s => ({ ...s, ai_enabled: v }))} />
          </div>
          <div className="space-y-2">
            <Label>Limite diário de tokens</Label>
            <Input type="number" value={settings.daily_token_limit} onChange={e => setSettings(s => ({ ...s, daily_token_limit: parseInt(e.target.value) || 0 }))} />
          </div>
          <Button onClick={saveSettings} disabled={saving}>Salvar</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function DataTab() {
  const { user } = useAuth();
  const { leads } = useLeadsContext();
  const [exporting, setExporting] = useState<string | null>(null);

  const downloadCSV = (filename: string, csvContent: string) => {
    const bom = "\uFEFF";
    const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportLeads = async () => {
    setExporting("leads");
    const header = "Nome,Telefone,Email,Tipo,Estágio,Operadora,Vidas,Valor Cotação,Valor Aprovado,Último Contato,Criado em";
    const rows = leads.map(l => [
      `"${l.name}"`, l.phone, l.email || "", l.type, l.stage, l.operator || "",
      l.lives || "", "", "", l.last_contact_at || "", l.created_at
    ].join(","));
    downloadCSV("leads.csv", [header, ...rows].join("\n"));
    setExporting(null);
    toast.success("Leads exportados");
  };

  const exportInteractions = async () => {
    if (!user) return;
    setExporting("interactions");
    const { data } = await supabase.from("interactions").select("*, leads(name)").eq("user_id", user.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(1000);
    const header = "Lead,Tipo,Descrição,Data";
    const rows = (data || []).map((i: any) => [
      `"${(i.leads as any)?.name || ""}"`, i.type, `"${i.description.replace(/"/g, '""')}"`, i.created_at
    ].join(","));
    downloadCSV("interacoes.csv", [header, ...rows].join("\n"));
    setExporting(null);
    toast.success("Interações exportadas");
  };

  const exportAllData = async () => {
    if (!user) return;
    setExporting("all");
    const [leadsRes, notesRes, tasksRes, docsRes] = await Promise.all([
      supabase.from("leads").select("*").eq("user_id", user.id),
      supabase.from("lead_notes").select("*").eq("user_id", user.id),
      supabase.from("tasks").select("*").eq("user_id", user.id),
      supabase.from("lead_documents").select("id, lead_id, file_name, category, created_at").eq("user_id", user.id),
    ]);
    const blob = new Blob([JSON.stringify({
      exported_at: new Date().toISOString(),
      leads: leadsRes.data, notes: notesRes.data, tasks: tasksRes.data, documents: docsRes.data
    }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "meus_dados.json";
    a.click(); URL.revokeObjectURL(url);
    setExporting(null);
    toast.success("Dados exportados (LGPD)");
  };

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exportar Dados</CardTitle>
          <CardDescription>Baixe seus dados em diferentes formatos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-start gap-2" onClick={exportLeads} disabled={!!exporting}>
            <Download className="h-4 w-4" /> Exportar leads (CSV)
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={exportInteractions} disabled={!!exporting}>
            <Download className="h-4 w-4" /> Exportar interações (CSV)
          </Button>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={exportAllData} disabled={!!exporting}>
            <Download className="h-4 w-4" /> Baixar meus dados (JSON — LGPD)
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Informações da Conta</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Conta criada em</span><span>{user?.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "-"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total de leads</span><span>{leads.length}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
