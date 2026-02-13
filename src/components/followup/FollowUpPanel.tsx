import { useState, useMemo } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { FUNNEL_STAGES } from "@/types/lead";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Clock, AlertTriangle, Sparkles, Copy, Check, Loader2, RefreshCw, Pencil, Send, Search, SendHorizonal, Brain, Lightbulb, Shield, Zap, Activity, Eye } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  if (idleDays >= 5) urgency = "critical";
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

const strategyLabels: Record<string, { label: string; emoji: string; color: string }> = {
  destravar_resposta: { label: "Destravar Resposta", emoji: "🔓", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  tratar_objecao: { label: "Tratar Objeção", emoji: "🛡️", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  reforcar_valor: { label: "Reforçar Valor", emoji: "💎", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  fechar_proxima_etapa: { label: "Fechar Próxima Etapa", emoji: "🎯", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  recuperar_lead_frio: { label: "Recuperar Lead Frio", emoji: "❄️", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300" },
  acompanhar_processo: { label: "Acompanhar Processo", emoji: "📋", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  primeira_abordagem: { label: "Primeira Abordagem", emoji: "👋", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
};

function formatIdleTime(hours: number, days: number) {
  if (days === 0) return `${hours}h parado`;
  if (days === 1) return "1 dia parado";
  return `${days} dias parado`;
}

const stagePriority: Record<string, number> = {
  tentativa_contato: 1, contato_realizado: 2, cotacao_enviada: 3,
  novo: 4, cotacao_aprovada: 5, documentacao_completa: 6,
  em_emissao: 7, aguardando_implantacao: 8, retrabalho: 9,
};

interface Timeline {
  days_since_first_contact: number;
  days_in_current_stage: number;
  days_since_last_contact: number;
  total_interactions: number;
  outbound_attempts: number;
  inbound_responses: number;
  avg_response_time_days: number | null;
}

interface FollowUpResult {
  analysis: string;
  strategy: string;
  strategy_reason: string;
  goal: string;
  silence_stage: string;
  pressure_level: string;
  flow_pattern: string;
  behavior: {
    decision_style: string | null;
    likely_objection: string | null;
    energy_level: string | null;
    confidence: string;
  };
  guardrails: {
    must_confirm_network: boolean;
    avoid_discount_promises: boolean;
    competitor_mode: boolean;
  };
  urgency_flag: boolean;
  messages: string[];
  risk_flags: string[];
  timeline: Timeline | null;
}

interface FollowUpPanelProps {
  singleLeadId?: string;
}

export function FollowUpPanel({ singleLeadId }: FollowUpPanelProps) {
  const { leads, addInteraction, updateLead } = useLeadsContext();
  const [filter, setFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, FollowUpResult>>({});
  const [copiedIdx, setCopiedIdx] = useState<{ leadId: string; idx: number } | null>(null);
  const [editingMsg, setEditingMsg] = useState<{ leadId: string; idx: number } | null>(null);
  const [contexts, setContexts] = useState<Record<string, string>>({});
  const [sendingFor, setSendingFor] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState<string | null>(null);

  const excludedStages = ["implantado", "declinado", "cancelado"];

  const operators = useMemo(() => {
    const ops = new Set(leads.map((l) => l.operator).filter(Boolean));
    return Array.from(ops) as string[];
  }, [leads]);

  const idleLeads = useMemo(() => {
    let base = leads.filter((l) => !excludedStages.includes(l.stage));
    if (singleLeadId) base = base.filter((l) => l.id === singleLeadId);
    return base
      .map(getIdleInfo)
      .sort((a, b) => {
        if (b.idleDays !== a.idleDays) return b.idleDays - a.idleDays;
        return (stagePriority[a.lead.stage] || 99) - (stagePriority[b.lead.stage] || 99);
      });
  }, [leads, singleLeadId]);

  const filtered = useMemo(() => {
    let result = idleLeads;
    if (filter !== "all") result = result.filter((il) => il.urgency === filter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((il) =>
        il.lead.name.toLowerCase().includes(q) ||
        il.lead.phone.includes(q) ||
        (il.lead.email && il.lead.email.toLowerCase().includes(q))
      );
    }
    if (typeFilter !== "all") result = result.filter((il) => il.lead.type === typeFilter);
    if (operatorFilter !== "all") result = result.filter((il) => il.lead.operator === operatorFilter);
    return result;
  }, [idleLeads, filter, searchQuery, typeFilter, operatorFilter]);

  const stats = useMemo(() => ({
    critical: idleLeads.filter((l) => l.urgency === "critical").length,
    high: idleLeads.filter((l) => l.urgency === "high").length,
    medium: idleLeads.filter((l) => l.urgency === "medium").length,
    total: idleLeads.length,
  }), [idleLeads]);

  const generateMessage = async (il: IdleLead) => {
    setGeneratingFor(il.lead.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: "Erro", description: "Você precisa estar logado", variant: "destructive" });
        setGeneratingFor(null);
        return;
      }
      const userContext = contexts[il.lead.id]?.trim() || "";
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/follow-up-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ leadId: il.lead.id, userContext }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro ao gerar mensagem" }));
        throw new Error(err.error || "Erro ao gerar mensagem");
      }
      const data = await resp.json();
      setResults((prev) => ({
        ...prev,
        [il.lead.id]: {
          analysis: data.analysis || "",
          strategy: data.strategy || "destravar_resposta",
          strategy_reason: data.strategy_reason || "",
          goal: data.goal || "",
          silence_stage: data.silence_stage || "early",
          pressure_level: data.pressure_level || "soft",
          flow_pattern: data.flow_pattern || "default",
          behavior: data.behavior || { decision_style: null, likely_objection: null, energy_level: null, confidence: "low" },
          guardrails: data.guardrails || { must_confirm_network: false, avoid_discount_promises: false, competitor_mode: false },
          urgency_flag: data.urgency_flag || false,
          messages: Array.isArray(data.messages) ? data.messages : [data.message],
          risk_flags: Array.isArray(data.risk_flags) ? data.risk_flags : [],
          timeline: data.timeline || null,
        },
      }));
      setEditingMsg(null);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setGeneratingFor(null);
  };

  const sendSingleMessage = async (lead: any, message: string, idx: number) => {
    setSendingFor(`${lead.id}-${idx}`);
    try {
      const resp = await supabase.functions.invoke("send-whatsapp", {
        body: { phone: lead.phone, message, lead_id: lead.id },
      });
      if (resp.error) throw new Error(resp.error.message);

      await addInteraction({
        lead_id: lead.id,
        type: "whatsapp",
        description: `[Follow-up ${idx + 1}] ${message.slice(0, 100)}${message.length > 100 ? "..." : ""}`,
      });

      toast({ title: "✅ Enviado!", description: `Mensagem ${idx + 1} enviada para ${lead.name}` });
      
      setResults((prev) => {
        const r = prev[lead.id];
        if (!r) return prev;
        const msgs = [...r.messages];
        msgs.splice(idx, 1);
        if (msgs.length === 0) {
          const copy = { ...prev };
          delete copy[lead.id];
          return copy;
        }
        return { ...prev, [lead.id]: { ...r, messages: msgs } };
      });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    } finally {
      setSendingFor(null);
    }
  };

  const sendAllMessages = async (lead: any, msgs: string[]) => {
    setSendingAll(lead.id);
    try {
      for (let i = 0; i < msgs.length; i++) {
        const resp = await supabase.functions.invoke("send-whatsapp", {
          body: { phone: lead.phone, message: msgs[i], lead_id: lead.id },
        });
        if (resp.error) throw new Error(resp.error.message);
        if (i < msgs.length - 1) await new Promise((r) => setTimeout(r, 1500));
      }

      await addInteraction({
        lead_id: lead.id,
        type: "whatsapp",
        description: `[Follow-up sequência ${msgs.length}x] ${msgs[0].slice(0, 80)}...`,
      });

      toast({ title: "✅ Sequência enviada!", description: `${msgs.length} mensagens enviadas para ${lead.name}` });
      setResults((prev) => {
        const copy = { ...prev };
        delete copy[lead.id];
        return copy;
      });
    } catch (e: any) {
      toast({ title: "Erro ao enviar sequência", description: e.message, variant: "destructive" });
    } finally {
      setSendingAll(null);
    }
  };

  const copyMessage = (leadId: string, idx: number, message: string) => {
    navigator.clipboard.writeText(message);
    setCopiedIdx({ leadId, idx });
    setTimeout(() => setCopiedIdx(null), 2000);
    toast({ title: "Copiado!" });
  };

  const copyAll = (leadId: string, msgs: string[]) => {
    navigator.clipboard.writeText(msgs.join("\n\n"));
    setCopiedIdx({ leadId, idx: -1 });
    setTimeout(() => setCopiedIdx(null), 2000);
    toast({ title: "Toda sequência copiada!" });
  };

  const updateMessageAt = (leadId: string, idx: number, value: string) => {
    setResults((prev) => {
      const r = prev[leadId];
      if (!r) return prev;
      const msgs = [...r.messages];
      msgs[idx] = value;
      return { ...prev, [leadId]: { ...r, messages: msgs } };
    });
  };

  const stageLabel = (key: string) => FUNNEL_STAGES.find((s) => s.key === key)?.label || key;
  const stageColor = (key: string) => FUNNEL_STAGES.find((s) => s.key === key)?.color || "hsl(0,0%,50%)";

  const isSingle = !!singleLeadId;

  return (
    <div className="space-y-4">
      {/* Stats */}
      {!isSingle && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total pendentes" value={stats.total} variant="default" />
          <StatCard label="Críticos (5d+)" value={stats.critical} variant="critical" />
          <StatCard label="Urgentes (3-4d)" value={stats.high} variant="high" />
          <StatCard label="Atenção (1-2d)" value={stats.medium} variant="medium" />
        </div>
      )}

      {/* Filters */}
      {!isSingle && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[160px] max-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar nome, telefone, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos ({idleLeads.length})</SelectItem>
              <SelectItem value="critical">Críticos ({stats.critical})</SelectItem>
              <SelectItem value="high">Urgentes ({stats.high})</SelectItem>
              <SelectItem value="medium">Atenção ({stats.medium})</SelectItem>
              <SelectItem value="low">OK</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos tipos</SelectItem>
              <SelectItem value="PF">PF</SelectItem>
              <SelectItem value="ADESAO">Adesão</SelectItem>
              <SelectItem value="PME">PME</SelectItem>
            </SelectContent>
          </Select>
          <Select value={operatorFilter} onValueChange={setOperatorFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Operadora" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas operadoras</SelectItem>
              {operators.map((op) => (
                <SelectItem key={op} value={op}>{op}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

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
          const result = results[il.lead.id];
          const msgs = result?.messages;
          const lastActivity = il.lead.last_contact_at || il.lead.updated_at || il.lead.created_at;
          const strat = result?.strategy ? strategyLabels[result.strategy] : null;

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
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {il.lead.type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      <span>{il.lead.phone}</span>
                      {il.lead.operator && <span>• {il.lead.operator}</span>}
                      {il.lead.lives && <span>• {il.lead.lives} vidas</span>}
                      {il.lead.email && <span>• {il.lead.email}</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Último contato: {formatDistanceToNow(new Date(lastActivity), { addSuffix: true, locale: ptBR })}
                    </div>
                  </div>
                  <Badge className={`${cfg.color} text-[10px] shrink-0 gap-1`}>
                    <Icon className="h-3 w-3" />
                    {formatIdleTime(il.idleHours, il.idleDays)}
                  </Badge>
                </div>

                {/* Context input */}
                <Textarea
                  placeholder="Contexto para a IA (ex: 'Já enviei cotação por email ontem', 'Ele pediu desconto')"
                  value={contexts[il.lead.id] || ""}
                  onChange={(e) => setContexts((prev) => ({ ...prev, [il.lead.id]: e.target.value }))}
                  className="text-xs min-h-[48px] resize-none"
                  rows={2}
                />

                {/* Analysis & Strategy — Brain Pro V2 */}
                {result && result.analysis && (
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                    {/* Header row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Brain className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Brain Pro V2</span>
                      {strat && (
                        <Badge className={`${strat.color} text-[10px] gap-1`}>
                          <span>{strat.emoji}</span> {strat.label}
                        </Badge>
                      )}
                      {result.urgency_flag && (
                        <Badge variant="destructive" className="text-[9px] gap-0.5">
                          <Zap className="h-2.5 w-2.5" /> Urgência real
                        </Badge>
                      )}
                    </div>

                    {/* Analysis text */}
                    <p className="text-xs text-foreground/80 leading-relaxed">{result.analysis}</p>
                    {result.goal && (
                      <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                        <Lightbulb className="h-3 w-3 shrink-0 mt-0.5" />
                        <span><strong>Objetivo:</strong> {result.goal}</span>
                      </div>
                    )}

                    {/* Timeline */}
                    {result.timeline && (
                      <div className="rounded border border-border/60 bg-background/50 p-2 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[9px] font-semibold uppercase text-muted-foreground">Timeline do lead</span>
                        </div>
                        <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                          <span>📅 {result.timeline.days_since_first_contact}d desde 1º contato</span>
                          <span>📌 {result.timeline.days_in_current_stage}d na etapa atual</span>
                          <span>🔇 {result.timeline.days_since_last_contact}d sem contato</span>
                          <span>📊 {result.timeline.total_interactions} interações</span>
                          <span>📤 {result.timeline.outbound_attempts} enviadas</span>
                          <span>📥 {result.timeline.inbound_responses} recebidas</span>
                        </div>
                        {result.timeline.avg_response_time_days !== null && (
                          <p className="text-[10px] text-muted-foreground">⏱️ Tempo médio de resposta: {result.timeline.avg_response_time_days}d</p>
                        )}
                      </div>
                    )}

                    {/* Silence / Pressure / Flow chips */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <SilenceChip stage={result.silence_stage} />
                      <PressureChip level={result.pressure_level} />
                      <FlowChip pattern={result.flow_pattern} />
                    </div>

                    {/* Behavior inference */}
                    {result.behavior && result.behavior.confidence !== "low" && (
                      <div className="rounded border border-border/60 bg-background/50 p-2 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Eye className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[9px] font-semibold uppercase text-muted-foreground">Leitura comportamental</span>
                          <Badge variant="outline" className="text-[8px] h-3.5 px-1">
                            {result.behavior.confidence === "high" ? "Alta confiança" : "Média confiança"}
                          </Badge>
                        </div>
                        <div className="flex gap-2 flex-wrap text-[10px] text-muted-foreground">
                          {result.behavior.decision_style && <span>🧠 {behaviorLabels.decision[result.behavior.decision_style]}</span>}
                          {result.behavior.likely_objection && <span>🛡️ {behaviorLabels.objection[result.behavior.likely_objection]}</span>}
                          {result.behavior.energy_level && <span>⚡ {behaviorLabels.energy[result.behavior.energy_level]}</span>}
                        </div>
                      </div>
                    )}

                    {/* Guardrails */}
                    {result.guardrails && (result.guardrails.must_confirm_network || result.guardrails.avoid_discount_promises || result.guardrails.competitor_mode) && (
                      <div className="rounded border border-warning/30 bg-warning/5 p-2 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Shield className="h-3 w-3 text-warning" />
                          <span className="text-[9px] font-semibold uppercase text-warning">Guardrails ativos</span>
                        </div>
                        <div className="flex gap-2 flex-wrap text-[10px]">
                          {result.guardrails.must_confirm_network && <Badge variant="outline" className="text-[8px] border-warning/40">🏥 Confirmar rede</Badge>}
                          {result.guardrails.avoid_discount_promises && <Badge variant="outline" className="text-[8px] border-warning/40">💰 Sem prometer desconto</Badge>}
                          {result.guardrails.competitor_mode && <Badge variant="outline" className="text-[8px] border-warning/40">🤝 Modo consultivo</Badge>}
                        </div>
                      </div>
                    )}

                    {/* Risk flags */}
                    {result.risk_flags && result.risk_flags.length > 0 && (
                      <div className="space-y-1">
                        {result.risk_flags.map((flag, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[10px] text-destructive/80">
                            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                            <span>{flag}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Message sequence */}
                {msgs && msgs.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Sequência ({msgs.length} mensagens)
                    </span>
                    {msgs.map((msg, idx) => {
                      const isEditing = editingMsg?.leadId === il.lead.id && editingMsg.idx === idx;
                      const isCopied = copiedIdx?.leadId === il.lead.id && copiedIdx.idx === idx;
                      const isSending = sendingFor === `${il.lead.id}-${idx}`;

                      return (
                        <div key={idx} className="group relative rounded-lg border border-border bg-muted/30 p-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                              {idx + 1}/{msgs.length}
                            </Badge>
                          </div>
                          {isEditing ? (
                            <Textarea
                              value={msg}
                              onChange={(e) => updateMessageAt(il.lead.id, idx, e.target.value)}
                              className="text-sm min-h-[40px] resize-none"
                              rows={2}
                              autoFocus
                            />
                          ) : (
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg}</p>
                          )}
                          <div className="flex items-center gap-1 mt-2">
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-1.5"
                              onClick={() => setEditingMsg(isEditing ? null : { leadId: il.lead.id, idx })}>
                              <Pencil className="h-3 w-3" />
                              {isEditing ? "OK" : "Editar"}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-1.5"
                              onClick={() => copyMessage(il.lead.id, idx, msg)}>
                              {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-1.5 text-emerald-600 hover:text-emerald-700"
                              onClick={() => sendSingleMessage(il.lead, msg, idx)} disabled={!!isSending}>
                              {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                              Enviar
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="text-xs gap-1.5"
                    onClick={() => generateMessage(il)} disabled={generatingFor === il.lead.id}>
                    {generatingFor === il.lead.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : result ? (
                      <RefreshCw className="h-3.5 w-3.5" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {result ? "Regenerar" : "Gerar follow-up estratégico"}
                  </Button>

                  {msgs && msgs.length > 0 && (
                    <>
                      <Button size="sm" className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => sendAllMessages(il.lead, msgs)} disabled={sendingAll === il.lead.id}>
                        {sendingAll === il.lead.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <SendHorizonal className="h-3.5 w-3.5" />
                        )}
                        {sendingAll === il.lead.id ? "Enviando..." : `Enviar sequência (${msgs.length})`}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs gap-1"
                        onClick={() => copyAll(il.lead.id, msgs)}>
                        {copiedIdx?.leadId === il.lead.id && copiedIdx.idx === -1 ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        Copiar tudo
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

const behaviorLabels = {
  decision: { analytical: "Analítico", practical: "Prático", emotional: "Emocional", skeptical: "Cético" } as Record<string, string>,
  objection: { price: "Preço", trust: "Confiança", indecision: "Indecisão", comparison: "Comparação" } as Record<string, string>,
  energy: { high: "Energia alta", medium: "Energia média", low: "Energia baixa" } as Record<string, string>,
};

function SilenceChip({ stage }: { stage: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    early: { label: "Silêncio inicial", cls: "bg-muted text-muted-foreground" },
    mid: { label: "Silêncio médio", cls: "bg-accent text-accent-foreground" },
    late: { label: "Silêncio longo", cls: "bg-destructive/10 text-destructive" },
  };
  const c = cfg[stage] || cfg.early;
  return <Badge className={`${c.cls} text-[9px] gap-0.5`}><Clock className="h-2.5 w-2.5" />{c.label}</Badge>;
}

function PressureChip({ level }: { level: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    soft: { label: "Pressão leve", cls: "bg-muted text-muted-foreground" },
    medium: { label: "Pressão média", cls: "bg-accent text-accent-foreground" },
    direct: { label: "Pressão direta", cls: "bg-primary/10 text-primary" },
  };
  const c = cfg[level] || cfg.soft;
  return <Badge className={`${c.cls} text-[9px] gap-0.5`}><Activity className="h-2.5 w-2.5" />{c.label}</Badge>;
}

function FlowChip({ pattern }: { pattern: string }) {
  const cfg: Record<string, { label: string }> = {
    super_short: { label: "Flow curto (2)" },
    default: { label: "Flow padrão" },
    validate_tension_direct: { label: "Validar→Tensão→CTA" },
  };
  const c = cfg[pattern] || cfg.default;
  return <Badge variant="outline" className="text-[9px]">{c.label}</Badge>;
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
