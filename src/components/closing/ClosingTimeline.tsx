import { useState } from "react";
import { useClosingSequence, getStepLabel } from "@/hooks/useClosingSequence";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Play, Pause, RotateCcw, Send, Edit3, Check, X, Sparkles, Target, Ban } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  leadId: string;
  leadStage: string;
}

const STEP_ICONS: Record<string, string> = {
  reforco_valor: "💎",
  tratamento_objecao: "🛡️",
  direcionar_decisao: "🎯",
  encerramento_elegante: "🤝",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  ready: "bg-primary/10 text-primary border-primary/30",
  sent: "bg-green-500/10 text-green-600 border-green-500/30",
  skipped: "bg-muted text-muted-foreground line-through",
};

export function ClosingTimeline({ leadId, leadStage }: Props) {
  const { sequence, steps, isLoading, startSequence, pauseSequence, resumeSequence, cancelSequence, markSent, regenerateStep, updateMessage } = useClosingSequence(leadId);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const isClosingStage = ["cotacao_enviada", "cotacao_aprovada"].includes(leadStage);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No sequence yet
  if (!sequence || sequence.status === "cancelled" || sequence.status === "completed") {
    return (
      <div className="space-y-3">
        <div className="text-center py-4 space-y-2">
          <Target className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            {sequence?.status === "completed"
              ? "Sequência de fechamento concluída!"
              : sequence?.status === "cancelled"
              ? "Sequência cancelada."
              : "Nenhuma sequência de fechamento ativa."}
          </p>
          {isClosingStage && (
            <Button
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={() => {
                startSequence.mutate(undefined, {
                  onSuccess: () => toast.success("Sequência de fechamento iniciada!"),
                  onError: (e) => toast.error(e.message),
                });
              }}
              disabled={startSequence.isPending}
            >
              {startSequence.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              {sequence ? "Nova Sequência" : "Iniciar Fechamento"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={sequence.status === "active" ? "default" : "secondary"} className="text-[10px]">
            {sequence.status === "active" ? "🔥 Ativa" : "⏸️ Pausada"}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            Etapa {sequence.current_step}/4
          </span>
        </div>
        <div className="flex gap-1">
          {sequence.status === "active" ? (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1"
              onClick={() => pauseSequence.mutate(undefined, { onSuccess: () => toast.success("Pausada"), onError: (e) => toast.error(e.message) })}
              disabled={pauseSequence.isPending}>
              <Pause className="h-3 w-3" /> Pausar
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1"
              onClick={() => resumeSequence.mutate(undefined, { onSuccess: () => toast.success("Retomada"), onError: (e) => toast.error(e.message) })}
              disabled={resumeSequence.isPending}>
              <Play className="h-3 w-3" /> Retomar
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] gap-1 text-destructive"
            onClick={() => cancelSequence.mutate(undefined, { onSuccess: () => toast.success("Cancelada"), onError: (e) => toast.error(e.message) })}
            disabled={cancelSequence.isPending}>
            <Ban className="h-3 w-3" /> Cancelar
          </Button>
        </div>
      </div>

      {/* Steps Timeline */}
      <div className="space-y-2">
        {steps.map((step, idx) => {
          const isEditing = editingStepId === step.id;
          const isCurrent = step.step_number === sequence.current_step;
          const isPast = step.status === "sent";
          const isFuture = step.status === "pending";

          return (
            <div
              key={step.id}
              className={`relative rounded-lg border p-3 transition-all ${
                isCurrent ? "border-primary/40 bg-primary/5 shadow-sm" : isPast ? "border-green-500/20 bg-green-500/5" : "border-border bg-card"
              }`}
            >
              {/* Connector line */}
              {idx < steps.length - 1 && (
                <div className={`absolute left-6 top-full w-0.5 h-2 ${isPast ? "bg-green-500/30" : "bg-border"}`} />
              )}

              {/* Step header */}
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{STEP_ICONS[step.step_type] || "📌"}</span>
                <span className="text-xs font-semibold flex-1">{getStepLabel(step.step_type)}</span>
                <Badge variant="outline" className={`text-[9px] ${STATUS_COLORS[step.status] || ""}`}>
                  {step.status === "sent" ? "Enviado" : step.status === "ready" ? "Pronto" : step.status === "pending" ? "Agendado" : step.status}
                </Badge>
              </div>

              {/* Schedule info */}
              <div className="text-[10px] text-muted-foreground mb-2">
                {step.sent_at
                  ? `Enviado ${format(new Date(step.sent_at), "dd/MM HH:mm", { locale: ptBR })}`
                  : `Agendado: ${format(new Date(step.scheduled_at), "dd/MM HH:mm", { locale: ptBR })} (${formatDistanceToNow(new Date(step.scheduled_at), { addSuffix: true, locale: ptBR })})`}
              </div>

              {/* AI Analysis */}
              {step.ai_analysis && (
                <div className="text-[10px] text-muted-foreground italic mb-2 flex items-start gap-1">
                  <Sparkles className="h-3 w-3 shrink-0 mt-0.5 text-primary/60" />
                  {step.ai_analysis}
                </div>
              )}

              {/* Message */}
              {step.generated_message && !isEditing && (
                <div className="p-2 rounded-md bg-background border border-border text-xs whitespace-pre-wrap mb-2">
                  {step.generated_message}
                </div>
              )}

              {/* Edit mode */}
              {isEditing && (
                <div className="space-y-2 mb-2">
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="text-xs"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => {
                      updateMessage.mutate({ stepId: step.id, message: editText }, {
                        onSuccess: () => { setEditingStepId(null); toast.success("Mensagem atualizada"); },
                        onError: (e) => toast.error(e.message),
                      });
                    }} disabled={updateMessage.isPending}>
                      <Check className="h-3 w-3" /> Salvar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => setEditingStepId(null)}>
                      <X className="h-3 w-3" /> Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              {(step.status === "ready" || (isCurrent && step.generated_message)) && !isEditing && (
                <div className="flex gap-1 flex-wrap">
                  {!isFuture && step.status !== "sent" && (
                    <>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => { setEditingStepId(step.id); setEditText(step.generated_message || ""); }}>
                        <Edit3 className="h-3 w-3" /> Editar
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1"
                        onClick={() => regenerateStep.mutate(step.id, { onSuccess: () => toast.success("Regenerada!"), onError: (e) => toast.error(e.message) })}
                        disabled={regenerateStep.isPending}>
                        {regenerateStep.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Regenerar
                      </Button>
                      <Button size="sm" className="h-6 text-[10px] gap-1 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                        onClick={() => {
                          if (step.generated_message) {
                            navigator.clipboard.writeText(step.generated_message);
                            markSent.mutate(step.id, { onSuccess: () => toast.success("Marcado como enviado!"), onError: (e) => toast.error(e.message) });
                          }
                        }}
                        disabled={markSent.isPending}>
                        {markSent.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                        Copiar & Enviar
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Loading state for pending steps without content */}
              {isFuture && !step.generated_message && (
                <p className="text-[10px] text-muted-foreground italic">Conteúdo será gerado quando esta etapa ficar pronta.</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
