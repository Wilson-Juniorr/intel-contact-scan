import { useState, useMemo } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { FUNNEL_STAGES } from "@/types/lead";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Clock, AlertTriangle, Sparkles, Copy, Check, Loader2, RefreshCw, Pencil, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const FOLLOW_UP_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/follow-up-message`;

interface IdleLead {
  lead: any;
  idleHours: number;
  idleDays: number;
  urgency: "low" | "medium" | "high" | "critical";
}

function getIdleInfo(lead: any): IdleLead {
  const lastActivity = lead.last_contact_at || lead.updated_at || lead.created_at;
  const diffMs = Date.now() - new Date(lastActivity).getTime();
  const idleHours = Math.floor(diffMs / (1000 * 60 * 60));
  const idleDays = Math.floor(idleHours / 24);

  let urgency: IdleLead["urgency"] = "low";
  if (idleDays >= 7) urgency = "critical";
  else if (idleDays >= 3) urgency = "high";
  else if (idleDays >= 1) urgency = "medium";

  return { lead, idleHours, idleDays, urgency };
}

const urgencyConfig = {
  critical: { label: "Crítico", color: "bg-destructive text-destructive-foreground", icon: AlertTriangle },
  high: { label: "Urgente", color: "bg-warning text-warning-foreground", icon: Clock },
  medium: { label: "Atenção", color: "bg-accent text-accent-foreground", icon: Clock },
  low: { label: "OK", color: "bg-muted text-muted-foreground", icon: Clock },
};

function formatIdleTime(hours: number, days: number) {
  if (days === 0) return `${hours}h parado`;
  if (days === 1) return "1 dia parado";
  return `${days} dias parado`;
}

export function FollowUpPanel() {
  const { leads } = useLeadsContext();
  const [filter, setFilter] = useState<string>("all");
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contexts, setContexts] = useState<Record<string, string>>({});

  const excludedStages = ["implantado", "declinado", "cancelado"];

  const idleLeads = useMemo(() => {
    return leads
      .filter((l) => !excludedStages.includes(l.stage))
      .map(getIdleInfo)
      .sort((a, b) => b.idleHours - a.idleHours);
  }, [leads]);

  const filtered = useMemo(() => {
    if (filter === "all") return idleLeads;
    return idleLeads.filter((il) => il.urgency === filter);
  }, [idleLeads, filter]);

  const stats = useMemo(() => ({
    critical: idleLeads.filter((l) => l.urgency === "critical").length,
    high: idleLeads.filter((l) => l.urgency === "high").length,
    medium: idleLeads.filter((l) => l.urgency === "medium").length,
    total: idleLeads.length,
  }), [idleLeads]);

  const generateMessage = async (il: IdleLead) => {
    setGeneratingFor(il.lead.id);
    try {
      const userContext = contexts[il.lead.id]?.trim() || "";
      const resp = await fetch(FOLLOW_UP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ lead: il.lead, idleHours: il.idleHours, idleDays: il.idleDays, userContext }),
      });
      if (!resp.ok) throw new Error("Erro ao gerar mensagem");
      const data = await resp.json();
      setMessages((prev) => ({ ...prev, [il.lead.id]: data.message }));
      setEditingId(null);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setGeneratingFor(null);
  };

  const sendToWhatsApp = (lead: any, message: string) => {
    const phone = lead.phone.replace(/\D/g, "");
    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/55${phone}?text=${encoded}`, "_blank");
  };

  const copyMessage = (id: string, message: string) => {
    navigator.clipboard.writeText(message);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Copiado!", description: "Mensagem copiada para a área de transferência" });
  };

  const stageLabel = (key: string) => FUNNEL_STAGES.find((s) => s.key === key)?.label || key;
  const stageColor = (key: string) => FUNNEL_STAGES.find((s) => s.key === key)?.color || "hsl(0,0%,50%)";

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total pendentes" value={stats.total} variant="default" />
        <StatCard label="Críticos (7d+)" value={stats.critical} variant="critical" />
        <StatCard label="Urgentes (3-7d)" value={stats.high} variant="high" />
        <StatCard label="Atenção (1-3d)" value={stats.medium} variant="medium" />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos ({idleLeads.length})</SelectItem>
            <SelectItem value="critical">Críticos ({stats.critical})</SelectItem>
            <SelectItem value="high">Urgentes ({stats.high})</SelectItem>
            <SelectItem value="medium">Atenção ({stats.medium})</SelectItem>
            <SelectItem value="low">OK</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lead list */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nenhum lead nesta categoria 🎉
            </CardContent>
          </Card>
        )}
        {filtered.map((il) => {
          const cfg = urgencyConfig[il.urgency];
          const Icon = cfg.icon;
          const msg = messages[il.lead.id];

          return (
            <Card key={il.lead.id} className="overflow-hidden">
              <CardContent className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm truncate">{il.lead.name}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0" style={{ borderColor: stageColor(il.lead.stage), color: stageColor(il.lead.stage) }}>
                        {stageLabel(il.lead.stage)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{il.lead.phone}</span>
                      {il.lead.operator && <span>• {il.lead.operator}</span>}
                      {il.lead.lives && <span>• {il.lead.lives} vidas</span>}
                    </div>
                  </div>
                  <Badge className={`${cfg.color} text-[10px] shrink-0 gap-1`}>
                    <Icon className="h-3 w-3" />
                    {formatIdleTime(il.idleHours, il.idleDays)}
                  </Badge>
                </div>

                {/* Context input */}
                <div className="space-y-1.5">
                  <Textarea
                    placeholder="Contexto para a IA (ex: 'Já enviei cotação por email ontem', 'Ele pediu desconto', 'Tentei ligar 2x sem resposta')"
                    value={contexts[il.lead.id] || ""}
                    onChange={(e) => setContexts((prev) => ({ ...prev, [il.lead.id]: e.target.value }))}
                    className="text-xs min-h-[48px] resize-none"
                    rows={2}
                  />
                </div>

                {/* AI message */}
                {msg && (
                  <div className="space-y-2">
                    {editingId === il.lead.id ? (
                      <Textarea
                        value={msg}
                        onChange={(e) => setMessages((prev) => ({ ...prev, [il.lead.id]: e.target.value }))}
                        className="text-sm min-h-[80px]"
                        rows={4}
                      />
                    ) : (
                      <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap border border-border">
                        {msg}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs gap-1.5"
                    onClick={() => generateMessage(il)}
                    disabled={generatingFor === il.lead.id}
                  >
                    {generatingFor === il.lead.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : msg ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {msg ? "Gerar outra" : "Gerar mensagem IA"}
                  </Button>

                  {msg && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1"
                        onClick={() => setEditingId(editingId === il.lead.id ? null : il.lead.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {editingId === il.lead.id ? "Pronto" : "Editar"}
                      </Button>
                      <Button
                        size="sm"
                        className="text-xs gap-1.5 bg-[hsl(142,70%,40%)] hover:bg-[hsl(142,70%,35%)] text-white"
                        onClick={() => sendToWhatsApp(il.lead, msg)}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs gap-1"
                        onClick={() => copyMessage(il.lead.id, msg)}
                      >
                        {copiedId === il.lead.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedId === il.lead.id ? "Copiado" : "Copiar"}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, variant }: { label: string; value: number; variant: string }) {
  const colors: Record<string, string> = {
    default: "text-foreground",
    critical: "text-destructive",
    high: "text-warning",
    medium: "text-muted-foreground",
  };
  return (
    <Card>
      <CardContent className="p-3">
        <p className={`text-2xl font-bold ${colors[variant] || "text-foreground"}`}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
