import { useState } from "react";
import { Lead, FUNNEL_STAGES, FunnelStage } from "@/types/lead";
import { getPlaybookForStage } from "@/data/playbooks";
import { getTemplatesForStage, fillTemplateVariables } from "@/data/whatsappTemplates";
import { useTasks } from "@/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, Target, MessageCircle, CalendarPlus,
  Loader2, Sparkles, Copy, Check, Trash2, Pencil, Brain, Lightbulb, RefreshCw,
  Shield, Zap, Clock, Activity, Eye, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const strategyLabels: Record<string, { label: string; emoji: string; color: string }> = {
  destravar_resposta: { label: "Destravar Resposta", emoji: "🔓", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  tratar_objecao: { label: "Tratar Objeção", emoji: "🛡️", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  reforcar_valor: { label: "Reforçar Valor", emoji: "💎", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  fechar_proxima_etapa: { label: "Fechar Próxima Etapa", emoji: "🎯", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  recuperar_lead_frio: { label: "Recuperar Lead Frio", emoji: "❄️", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300" },
  acompanhar_processo: { label: "Acompanhar Processo", emoji: "📋", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  primeira_abordagem: { label: "Primeira Abordagem", emoji: "👋", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
};

interface Props {
  lead: Lead;
}

export function PlaybookTab({ lead }: Props) {
  const playbook = getPlaybookForStage(lead.stage as FunnelStage);
  const templates = getTemplatesForStage(lead.stage);
  const { tasks, addTask, completeTask, deleteTask, isLoading } = useTasks(lead.id);
  const openTasks = tasks.filter((t: any) => t.status === "open");
  const doneTasks = tasks.filter((t: any) => t.status === "done");

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const [regeneratingIdx, setRegeneratingIdx] = useState<number | null>(null);
  const [suggestedMsgs, setSuggestedMsgs] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState("");
  const [strategy, setStrategy] = useState("");
  const [strategyReason, setStrategyReason] = useState("");
  const [goal, setGoal] = useState("");
  const [silenceStage, setSilenceStage] = useState("");
  const [pressureLevel, setPressureLevel] = useState("");
  const [flowPattern, setFlowPattern] = useState("");
  const [behavior, setBehavior] = useState<any>(null);
  const [guardrails, setGuardrails] = useState<any>(null);
  const [urgencyFlag, setUrgencyFlag] = useState(false);
  const [riskFlags, setRiskFlags] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<any>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [aiTasks, setAiTasks] = useState<{ title: string; reason: string }[]>([]);
  const [generatingAiTasks, setGeneratingAiTasks] = useState(false);

  const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);

  const handleAddTask = async (title?: string) => {
    const t = title || newTaskTitle.trim();
    if (!t) return;
    setSaving(true);
    try {
      await addTask({ lead_id: lead.id, title: t, due_at: newTaskDue || undefined });
      setNewTaskTitle("");
      setNewTaskDue("");
      toast({ title: "Tarefa criada!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (taskId: string) => {
    try {
      await completeTask(taskId, lead.id);
      toast({ title: "Tarefa concluída!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleGenerateAiTasks = async () => {
    setGeneratingAiTasks(true);
    setAiTasks([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Não autenticado");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ leadId: lead.id }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao sugerir tarefas");
      }
      const data = await resp.json();
      setAiTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingAiTasks(false);
    }
  };

  const handleGenerateMessage = async () => {
    setGeneratingMsg(true);
    setSuggestedMsgs([]);
    setAnalysis("");
    setStrategy("");
    setStrategyReason("");
    setGoal("");
    setSilenceStage("");
    setPressureLevel("");
    setFlowPattern("");
    setBehavior(null);
    setGuardrails(null);
    setUrgencyFlag(false);
    setRiskFlags([]);
    setTimeline(null);
    setCopiedIdx(null);
    setEditingIdx(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Não autenticado");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/follow-up-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ leadId: lead.id, userContext: playbook ? `Objetivo do playbook: ${playbook.objective}` : undefined }),
      });
      if (!resp.ok) throw new Error("Erro ao gerar mensagem");
      const data = await resp.json();
      const msgs = Array.isArray(data.messages) ? data.messages : [data.message];
      setSuggestedMsgs(msgs);
      setAnalysis(data.analysis || "");
      setStrategy(data.strategy || "");
      setStrategyReason(data.strategy_reason || "");
      setGoal(data.goal || "");
      setSilenceStage(data.silence_stage || "");
      setPressureLevel(data.pressure_level || "");
      setFlowPattern(data.flow_pattern || "");
      setBehavior(data.behavior || null);
      setGuardrails(data.guardrails || null);
      setUrgencyFlag(data.urgency_flag || false);
      setRiskFlags(Array.isArray(data.risk_flags) ? data.risk_flags : []);
      setTimeline(data.timeline || null);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingMsg(false);
    }
  };

  const handleRegenerateSingle = async (idx: number) => {
    setRegeneratingIdx(idx);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Não autenticado");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/follow-up-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          leadId: lead.id,
          userContext: playbook ? `Objetivo do playbook: ${playbook.objective}` : undefined,
          regenerateIndex: idx,
          existingMessages: suggestedMsgs,
          existingAnalysis: analysis,
        }),
      });
      if (!resp.ok) throw new Error("Erro ao regenerar mensagem");
      const data = await resp.json();
      if (data.message) {
        const copy = [...suggestedMsgs];
        copy[idx] = data.message;
        setSuggestedMsgs(copy);
        toast({ title: `Mensagem ${idx + 1} regenerada! ✨` });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setRegeneratingIdx(null);
    }
  };

  const strat = strategy ? strategyLabels[strategy] : null;

  return (
    <div className="space-y-4">
      {/* Playbook header */}
      {playbook && (
        <Card className="border-primary/20">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Playbook: {stageInfo?.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">{playbook.objective}</p>
            <p className="text-[10px] text-muted-foreground italic">
              ⚠️ {playbook.priorityTrigger} → Urgente após {playbook.daysUrgent}d, Crítico após {playbook.daysCritical}d
            </p>
          </CardContent>
        </Card>
      )}

      {/* Suggested tasks from playbook */}
      {playbook && playbook.tasks.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">Tarefas sugeridas</h4>
          {playbook.tasks.map((pt, i) => {
            const alreadyCreated = tasks.some((t: any) => t.title === pt.title);
            return (
              <div key={i} className="flex items-center gap-2 p-2 rounded-md border border-dashed border-border text-xs">
                <span className="flex-1">{pt.title}</span>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2"
                  disabled={alreadyCreated} onClick={() => handleAddTask(pt.title)}>
                  {alreadyCreated ? <Check className="h-3 w-3" /> : <CalendarPlus className="h-3 w-3" />}
                  {alreadyCreated ? "Criada" : "Criar"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* AI-suggested tasks based on conversation */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Brain className="h-3 w-3" /> Tarefas sugeridas pela IA
          </h4>
          <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2" onClick={handleGenerateAiTasks} disabled={generatingAiTasks}>
            {generatingAiTasks ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {aiTasks.length > 0 ? "Atualizar" : "Analisar conversa"}
          </Button>
        </div>
        {generatingAiTasks && (
          <p className="text-[10px] text-muted-foreground animate-pulse">Analisando conversas, áudios, imagens e PDFs...</p>
        )}
        {aiTasks.map((at, i) => {
          const alreadyCreated = tasks.some((t: any) => t.title === at.title);
          return (
            <div key={i} className="p-2 rounded-md border border-primary/20 bg-primary/5 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3 w-3 text-primary shrink-0" />
                <span className="flex-1 font-medium">{at.title}</span>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2 shrink-0"
                  disabled={alreadyCreated} onClick={() => handleAddTask(at.title)}>
                  {alreadyCreated ? <Check className="h-3 w-3" /> : <CalendarPlus className="h-3 w-3" />}
                  {alreadyCreated ? "Criada" : "Criar"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground pl-5">{at.reason}</p>
            </div>
          );
        })}
        {aiTasks.length === 0 && !generatingAiTasks && (
          <p className="text-[10px] text-muted-foreground">Clique em "Analisar conversa" para gerar tarefas baseadas no histórico</p>
        )}
      </div>

      {/* Open tasks */}
      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase">
          Tarefas abertas ({openTasks.length})
        </h4>
        {openTasks.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma tarefa aberta</p>}
        {openTasks.map((task: any) => (
          <div key={task.id} className="flex items-center gap-2 p-2 rounded-md border border-border bg-card text-xs group">
            <button onClick={() => handleComplete(task.id)} className="shrink-0 hover:text-primary transition-colors">
              <Circle className="h-4 w-4" />
            </button>
            <span className="flex-1">{task.title}</span>
            {task.due_at && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                {format(new Date(task.due_at), "dd/MM HH:mm", { locale: ptBR })}
              </span>
            )}
            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100" onClick={async () => {
              await deleteTask(task.id);
              toast({ title: "Tarefa removida" });
            }}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ))}
        {doneTasks.length > 0 && (
          <details className="text-xs">
            <summary className="text-muted-foreground cursor-pointer">{doneTasks.length} concluída(s)</summary>
            <div className="space-y-1 mt-1">
              {doneTasks.map((task: any) => (
                <div key={task.id} className="flex items-center gap-2 p-1.5 text-muted-foreground line-through">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{task.title}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Add custom task */}
      <div className="flex gap-2">
        <Input placeholder="Nova tarefa..." value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)}
          className="h-8 text-xs flex-1" onKeyDown={(e) => e.key === "Enter" && handleAddTask()} />
        <Button size="sm" className="h-8 text-xs gap-1" onClick={() => handleAddTask()} disabled={!newTaskTitle.trim() || saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarPlus className="h-3 w-3" />}
        </Button>
      </div>

      {/* Generate AI message */}
      <div className="space-y-2">
        <Button size="sm" variant="outline" className="w-full text-xs gap-1.5 h-8" onClick={handleGenerateMessage} disabled={generatingMsg}>
          {generatingMsg ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {suggestedMsgs.length > 0 ? "Regenerar follow-up estratégico" : "Gerar follow-up estratégico"}
        </Button>

        {/* Analysis & Strategy — Brain Pro V2 */}
        {analysis && (
          <div className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Brain className="h-3 w-3 text-primary shrink-0" />
              <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Brain Pro V2</span>
              {strat && (
                <Badge className={`${strat.color} text-[9px] gap-0.5`}>
                  <span>{strat.emoji}</span> {strat.label}
                </Badge>
              )}
              {urgencyFlag && (
                <Badge variant="destructive" className="text-[8px] gap-0.5">
                  <Zap className="h-2 w-2" /> Urgência
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-foreground/80 leading-relaxed">{analysis}</p>
            {goal && (
              <div className="flex items-start gap-1 text-[9px] text-muted-foreground">
                <Lightbulb className="h-2.5 w-2.5 shrink-0 mt-0.5" />
                <span><strong>Objetivo:</strong> {goal}</span>
              </div>
            )}

            {/* Timeline */}
            {timeline && (
              <div className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
                <span>📅 {timeline.days_since_first_contact}d desde 1º contato</span>
                <span>📌 {timeline.days_in_current_stage}d na etapa</span>
                <span>🔇 {timeline.days_since_last_contact}d sem contato</span>
                <span>📤 {timeline.outbound_attempts} enviadas</span>
                <span>📥 {timeline.inbound_responses} recebidas</span>
                {timeline.avg_response_time_days !== null && <span>⏱️ Resp. média: {timeline.avg_response_time_days}d</span>}
              </div>
            )}

            {/* Chips */}
            {silenceStage && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[8px] gap-0.5"><Clock className="h-2 w-2" /> {silenceStage === "early" ? "Silêncio inicial" : silenceStage === "mid" ? "Silêncio médio" : "Silêncio longo"}</Badge>
                <Badge variant="outline" className="text-[8px] gap-0.5"><Activity className="h-2 w-2" /> {pressureLevel === "soft" ? "Pressão leve" : pressureLevel === "medium" ? "Pressão média" : "Pressão direta"}</Badge>
                <Badge variant="outline" className="text-[8px]">{flowPattern === "super_short" ? "Flow curto" : flowPattern === "validate_tension_direct" ? "Validar→CTA" : "Flow padrão"}</Badge>
              </div>
            )}

            {/* Behavior */}
            {behavior && behavior.confidence !== "low" && (
              <div className="text-[9px] text-muted-foreground flex gap-2 flex-wrap">
                <Eye className="h-2.5 w-2.5 shrink-0" />
                {behavior.decision_style && <span>🧠 {({analytical:"Analítico",practical:"Prático",emotional:"Emocional",skeptical:"Cético"} as any)[behavior.decision_style]}</span>}
                {behavior.likely_objection && <span>🛡️ {({price:"Preço",trust:"Confiança",indecision:"Indecisão",comparison:"Comparação"} as any)[behavior.likely_objection]}</span>}
                {behavior.energy_level && <span>⚡ {({high:"Alta",medium:"Média",low:"Baixa"} as any)[behavior.energy_level]}</span>}
              </div>
            )}

            {/* Guardrails */}
            {guardrails && (guardrails.must_confirm_network || guardrails.avoid_discount_promises || guardrails.competitor_mode) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Shield className="h-2.5 w-2.5 text-warning" />
                {guardrails.must_confirm_network && <Badge variant="outline" className="text-[8px] border-warning/40">🏥 Confirmar rede</Badge>}
                {guardrails.avoid_discount_promises && <Badge variant="outline" className="text-[8px] border-warning/40">💰 Sem desconto</Badge>}
                {guardrails.competitor_mode && <Badge variant="outline" className="text-[8px] border-warning/40">🤝 Consultivo</Badge>}
              </div>
            )}

            {/* Risk flags */}
            {riskFlags.length > 0 && riskFlags.map((flag, i) => (
              <div key={i} className="flex items-start gap-1 text-[9px] text-destructive/80">
                <AlertTriangle className="h-2.5 w-2.5 shrink-0 mt-0.5" />
                <span>{flag}</span>
              </div>
            ))}
          </div>
        )}

        {suggestedMsgs.length > 0 && (
          <div className="space-y-2">
            {suggestedMsgs.map((msg, idx) => (
              <div key={idx} className="bg-muted/30 rounded-lg p-2.5 text-xs border border-border space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{idx + 1}/{suggestedMsgs.length}</Badge>
                </div>
                {editingIdx === idx ? (
                  <textarea
                    className="w-full text-xs bg-background border border-input rounded p-1.5 resize-none"
                    value={msg} rows={2}
                    onChange={(e) => {
                      const copy = [...suggestedMsgs];
                      copy[idx] = e.target.value;
                      setSuggestedMsgs(copy);
                    }}
                  />
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg}</p>
                )}
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-5 text-[9px] gap-0.5 px-1" onClick={() => setEditingIdx(editingIdx === idx ? null : idx)}>
                    <Pencil className="h-2.5 w-2.5" />{editingIdx === idx ? "OK" : "Editar"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-5 text-[9px] gap-0.5 px-1" onClick={async () => {
                    await navigator.clipboard.writeText(msg);
                    setCopiedIdx(idx);
                    toast({ title: "Copiado!" });
                    setTimeout(() => setCopiedIdx(null), 2000);
                  }}>
                    {copiedIdx === idx ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-5 text-[9px] gap-0.5 px-1"
                    onClick={() => handleRegenerateSingle(idx)}
                    disabled={regeneratingIdx === idx}>
                    {regeneratingIdx === idx ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <RefreshCw className="h-2.5 w-2.5" />}
                    Regenerar
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 text-xs gap-1 h-7" onClick={async () => {
                await navigator.clipboard.writeText(suggestedMsgs.join("\n\n"));
                setCopiedIdx(-1);
                toast({ title: "Toda sequência copiada!" });
                setTimeout(() => setCopiedIdx(null), 2000);
              }}>
                {copiedIdx === -1 ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                Copiar tudo
              </Button>
              <Button size="sm" className="flex-1 text-xs gap-1 h-7 bg-secondary hover:bg-secondary/90 text-secondary-foreground" asChild>
                <a href={`https://wa.me/55${lead.phone.replace(/\D/g, "")}?text=${encodeURIComponent(suggestedMsgs[0])}`} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-3 w-3" /> WhatsApp
                </a>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Recommended templates */}
      {playbook && templates.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">Templates recomendados</h4>
          {templates.filter((t) => playbook.recommendedTemplates.includes(t.id)).map((tmpl) => {
            const filled = fillTemplateVariables(tmpl.text, {
              nome: lead.name.split(" ")[0],
              operadora: lead.operator || undefined,
              vidas: lead.lives || undefined,
            });
            return (
              <div key={tmpl.id} className="p-2 rounded-md border border-border text-xs space-y-1">
                <p className="font-medium">{tmpl.label}</p>
                <p className="text-muted-foreground whitespace-pre-wrap">{filled}</p>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={async () => {
                  await navigator.clipboard.writeText(filled);
                  toast({ title: "Template copiado!" });
                }}>
                  <Copy className="h-2.5 w-2.5" /> Copiar
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
