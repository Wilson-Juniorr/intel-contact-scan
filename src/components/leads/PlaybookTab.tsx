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
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  CheckCircle2, Circle, Target, MessageCircle, CalendarPlus,
  Loader2, Sparkles, Copy, Check, Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  const [suggestedMsg, setSuggestedMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);

  const handleAddTask = async (title?: string) => {
    const t = title || newTaskTitle.trim();
    if (!t) return;
    setSaving(true);
    try {
      await addTask({
        lead_id: lead.id,
        title: t,
        due_at: newTaskDue || undefined,
      });
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

  const handleGenerateMessage = async () => {
    setGeneratingMsg(true);
    setSuggestedMsg("");
    setCopied(false);
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
      setSuggestedMsg(data.message);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingMsg(false);
    }
  };

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
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] gap-1 px-2"
                  disabled={alreadyCreated}
                  onClick={() => handleAddTask(pt.title)}
                >
                  {alreadyCreated ? <Check className="h-3 w-3" /> : <CalendarPlus className="h-3 w-3" />}
                  {alreadyCreated ? "Criada" : "Criar"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

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
        <Input
          placeholder="Nova tarefa..."
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          className="h-8 text-xs flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
        />
        <Button size="sm" className="h-8 text-xs gap-1" onClick={() => handleAddTask()} disabled={!newTaskTitle.trim() || saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarPlus className="h-3 w-3" />}
        </Button>
      </div>

      {/* Generate AI message */}
      <div className="space-y-2">
        <Button size="sm" variant="outline" className="w-full text-xs gap-1.5 h-8" onClick={handleGenerateMessage} disabled={generatingMsg}>
          {generatingMsg ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Gerar mensagem alinhada ao playbook
        </Button>

        {suggestedMsg && (
          <div className="space-y-2">
            <div className="bg-muted/30 rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap border border-border">
              {suggestedMsg}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 text-xs gap-1 h-7" onClick={async () => {
                await navigator.clipboard.writeText(suggestedMsg);
                setCopied(true);
                toast({ title: "Copiado!" });
                setTimeout(() => setCopied(false), 2000);
              }}>
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copiado!" : "Copiar"}
              </Button>
              <Button size="sm" className="flex-1 text-xs gap-1 h-7 bg-secondary hover:bg-secondary/90 text-secondary-foreground" asChild>
                <a href={`https://wa.me/55${lead.phone.replace(/\D/g, "")}?text=${encodeURIComponent(suggestedMsg)}`} target="_blank" rel="noopener noreferrer">
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
