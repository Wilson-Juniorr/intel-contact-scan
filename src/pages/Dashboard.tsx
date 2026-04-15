import { useMemo, useState, useEffect } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { useTasks } from "@/hooks/useTasks";
import { FUNNEL_STAGES } from "@/types/lead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { useOnboarding } from "@/hooks/useOnboarding";
import { DashboardMetrics } from "@/components/dashboard/DashboardMetrics";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Users,
  UserPlus,
  Handshake,
  TrendingUp,
  AlertTriangle,
  Phone,
  CheckSquare,
  Plus,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

const AVATAR_GRADIENTS = [
  "from-blue-500 to-cyan-400",
  "from-purple-500 to-pink-400",
  "from-amber-500 to-orange-400",
  "from-emerald-500 to-teal-400",
  "from-rose-500 to-red-400",
  "from-indigo-500 to-violet-400",
];

function getAvatarGradient(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx];
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

const GRADIENT_MAP: Record<string, string> = {
  "text-primary": "gradient-card-blue",
  "text-warning": "gradient-card-amber",
  "text-secondary": "gradient-card-green",
  "text-destructive": "gradient-card-red",
};

export default function Dashboard() {
  const { leads } = useLeadsContext();
  const { todayTasks } = useTasks();
  const navigate = useNavigate();
  const { step, completed: onboardingCompleted, setStep } = useOnboarding();
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  useEffect(() => {
    if (step === 0 && !onboardingCompleted) setWelcomeOpen(true);
  }, [step, onboardingCompleted]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const newToday = leads.filter((l) => new Date(l.created_at) >= today).length;
    const newWeek = leads.filter((l) => new Date(l.created_at) >= weekAgo).length;
    const negotiating = leads.filter(
      (l) => l.stage === "cotacao_enviada" || l.stage === "cotacao_aprovada"
    ).length;
    const converted = leads.filter((l) => l.stage === "implantado").length;
    const lost = leads.filter((l) => l.stage === "cancelado" || l.stage === "declinado").length;

    const needsFollowUp = leads.filter((l) => {
      if (l.stage === "implantado" || l.stage === "cancelado" || l.stage === "declinado")
        return false;
      if (!l.last_contact_at) return true;
      const daysSince =
        (Date.now() - new Date(l.last_contact_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysSince >= 2;
    });

    return { total: leads.length, newToday, newWeek, negotiating, converted, lost, needsFollowUp };
  }, [leads]);

  const funnelData = useMemo(() => {
    return FUNNEL_STAGES.filter((s) => s.key !== "cancelado" && s.key !== "declinado").map(
      (stage) => ({
        name: stage.label,
        value: leads.filter((l) => l.stage === stage.key).length,
        color: stage.color,
      })
    );
  }, [leads]);

  const recentLeads = useMemo(() => {
    return [...leads]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5);
  }, [leads]);

  const statCards = [
    { label: "Total de Leads", value: stats.total, icon: Users, accent: "text-primary" },
    { label: "Novos (semana)", value: stats.newWeek, icon: UserPlus, accent: "text-primary" },
    { label: "Em Cotação", value: stats.negotiating, icon: Handshake, accent: "text-warning" },
    { label: "Implantados", value: stats.converted, icon: TrendingUp, accent: "text-secondary" },
    { label: "Cancelados", value: stats.lost, icon: AlertTriangle, accent: "text-destructive" },
    { label: "Follow-up", value: stats.needsFollowUp.length, icon: Phone, accent: "text-warning" },
    { label: "Tarefas hoje", value: todayTasks.length, icon: CheckSquare, accent: "text-primary" },
  ];

  if (leads.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-24 text-center space-y-4"
      >
        <Users className="h-16 w-16 text-muted-foreground/30" />
        <div>
          <h2 className="text-xl font-semibold">Nenhum lead ainda</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Comece criando seu primeiro lead ou sincronizando o WhatsApp.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/leads")} className="gap-2 bg-gradient-to-r from-primary to-blue-500 shadow-md shadow-primary/20 btn-press">
            <Plus className="h-4 w-4" /> Criar Lead
          </Button>
          <Button variant="outline" onClick={() => navigate("/whatsapp")} className="gap-2 btn-press">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <>
    <WelcomeModal open={welcomeOpen} onClose={() => { setWelcomeOpen(false); setStep(1); }} />
    <OnboardingChecklist />
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Visão geral dos seus leads</p>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
          >
            <Card className={`hover-card-lift border border-border/50 ${GRADIENT_MAP[s.accent] || "gradient-card-blue"}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${s.accent === "text-primary" ? "from-primary/20 to-primary/5" : s.accent === "text-warning" ? "from-warning/20 to-warning/5" : s.accent === "text-destructive" ? "from-destructive/20 to-destructive/5" : "from-success/20 to-success/5"}`}>
                    <s.icon className={`h-4 w-4 ${s.accent}`} />
                  </div>
                </div>
                <motion.p
                  className="text-2xl font-bold animate-count-up"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 + 0.2 }}
                >
                  {s.value}
                </motion.p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
          <Card className="hover-card-lift">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                Funil de Vendas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={funnelData} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      color: "hsl(var(--foreground))",
                    }}
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
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 }}>
          <Card className="hover-card-lift">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                Leads Recentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {recentLeads.map((lead, i) => {
                const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);
                return (
                  <motion.div
                    key={lead.id}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.05 }}
                    className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0 hover:bg-muted/40 rounded-lg px-2 -mx-2 transition-colors duration-150 cursor-pointer"
                    onClick={() => navigate("/leads")}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-8 w-8 rounded-full bg-gradient-to-br ${getAvatarGradient(lead.name)} flex items-center justify-center shrink-0`}>
                        <span className="text-white font-semibold text-[10px]">{getInitials(lead.name)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{lead.name}</p>
                        <p className="text-xs text-muted-foreground">{lead.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-2 gap-1"
                        style={{ borderColor: stageInfo?.color, color: stageInfo?.color }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ backgroundColor: stageInfo?.color }} />
                        {stageInfo?.label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(lead.updated_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {todayTasks.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <Card
            className="border-primary/30 cursor-pointer hover-card-lift gradient-card-blue"
            onClick={() => navigate("/today")}
          >
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-primary" />
                Tarefas pendentes hoje ({todayTasks.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {todayTasks.slice(0, 5).map((task: any) => (
                <div key={task.id} className="flex items-center justify-between py-1 hover:bg-muted/30 rounded px-2 -mx-2 transition-colors">
                  <span className="text-sm">{task.title}</span>
                  {task.due_at && (
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(task.due_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  )}
                </div>
              ))}
              {todayTasks.length > 5 && (
                <p className="text-xs text-muted-foreground">+{todayTasks.length - 5} mais...</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {stats.needsFollowUp.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
          <Card className="border-warning/30 gradient-card-amber">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-5 w-5 text-warning" />
                Leads que precisam de follow-up
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.needsFollowUp.map((lead) => (
                <div key={lead.id} className="flex items-center justify-between py-1 hover:bg-muted/30 rounded px-2 -mx-2 transition-colors">
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
        </motion.div>
      )}

      <DashboardMetrics leads={leads} />
    </div>
    </>
  );
}
