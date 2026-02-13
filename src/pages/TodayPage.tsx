import { useState, useMemo, useCallback } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { useTasks } from "@/hooks/useTasks";
import { FUNNEL_STAGES, FunnelStage } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  Sparkles, MessageCircle, Clock, CheckCircle2, Search,
  Loader2, Phone, Users, Building2, AlertTriangle, Zap,
  Eye, CalendarPlus, Filter, RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Priority = "critico" | "urgente" | "atencao" | "ok";

interface NBAResult {
  id: string;
  priority: Priority;
  reason: string;
  suggested_action: string;
  suggested_message?: string;
  suggested_task?: string;
}

const priorityConfig: Record<Priority, { label: string; color: string; order: number; icon: typeof AlertTriangle }> = {
  critico: { label: "Crítico", color: "bg-destructive/15 text-destructive border-destructive/30", order: 0, icon: AlertTriangle },
  urgente: { label: "Urgente", color: "bg-orange-500/15 text-orange-500 border-orange-500/30", order: 1, icon: Zap },
  atencao: { label: "Atenção", color: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30", order: 2, icon: Eye },
  ok: { label: "OK", color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30", order: 3, icon: CheckCircle2 },
};

const ACTIVE_STAGES: FunnelStage[] = [
  "novo", "tentativa_contato", "contato_realizado", "cotacao_enviada",
  "cotacao_aprovada", "documentacao_completa", "em_emissao",
  "aguardando_implantacao", "retrabalho",
];

export default function TodayPage() {
  const { leads } = useLeadsContext();
  const { addTask, markDone } = useTasks();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [onlyNoResponse, setOnlyNoResponse] = useState(false);

  const [nbaResults, setNbaResults] = useState<Map<string, NBAResult>>(new Map());
  const [loadingNBA, setLoadingNBA] = useState(false);
  const [doneLeads, setDoneLeads] = useState<Set<string>>(new Set());

  // Task dialog
  const [taskDialog, setTaskDialog] = useState<{ leadId: string; leadName: string; title: string } | null>(null);
  const [taskDueAt, setTaskDueAt] = useState("");
  const [savingTask, setSavingTask] = useState(false);

  // Message dialog
  const [msgDialog, setMsgDialog] = useState<{ leadId: string; leadName: string; message: string } | null>(null);

  const activeLeads = useMemo(() => {
    return leads.filter((l) => ACTIVE_STAGES.includes(l.stage as FunnelStage));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    let result = activeLeads;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((l) => l.name.toLowerCase().includes(s) || l.phone.includes(s));
    }
    if (stageFilter !== "all") result = result.filter((l) => l.stage === stageFilter);
    if (priorityFilter !== "all") {
      result = result.filter((l) => {
        const nba = nbaResults.get(l.id);
        return nba?.priority === priorityFilter;
      });
    }
    if (onlyNoResponse) {
      // Filter leads where the last interaction was outbound and no inbound after
      result = result.filter((l) => {
        if (!l.last_contact_at) return true;
        const days = (Date.now() - new Date(l.last_contact_at).getTime()) / (1000 * 60 * 60 * 24);
        return days >= 1;
      });
    }
    // Sort: prioritized leads first (if NBA results exist), then by idle time
    result = [...result].sort((a, b) => {
      const nbaA = nbaResults.get(a.id);
      const nbaB = nbaResults.get(b.id);
      const orderA = nbaA ? (priorityConfig[nbaA.priority]?.order ?? 4) : 4;
      const orderB = nbaB ? (priorityConfig[nbaB.priority]?.order ?? 4) : 4;
      if (orderA !== orderB) return orderA - orderB;
      // By idle time desc
      const timeA = new Date(a.last_contact_at || a.created_at).getTime();
      const timeB = new Date(b.last_contact_at || b.created_at).getTime();
      return timeA - timeB;
    });
    return result;
  }, [activeLeads, search, stageFilter, priorityFilter, onlyNoResponse, nbaResults]);

  const generateNBA = useCallback(async () => {
    if (!activeLeads.length) return;
    setLoadingNBA(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Não autenticado");

      // Process in batches of 20
      const batches: string[][] = [];
      for (let i = 0; i < activeLeads.length; i += 20) {
        batches.push(activeLeads.slice(i, i + 20).map((l) => l.id));
      }

      const allResults = new Map<string, NBAResult>();
      for (const batch of batches) {
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/next-best-action`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ leadIds: batch }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Erro" }));
          throw new Error(err.error || "Erro ao gerar sugestões");
        }
        const data = await resp.json();
        (data.results || []).forEach((r: NBAResult) => allResults.set(r.id, r));
      }
      setNbaResults(allResults);
      toast({ title: "Sugestões geradas", description: `${allResults.size} leads analisados` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoadingNBA(false);
    }
  }, [activeLeads]);

  const handleMarkDone = async (leadId: string) => {
    try {
      await markDone(leadId, "action_completed");
      setDoneLeads((prev) => new Set(prev).add(leadId));
      toast({ title: "Marcado como feito!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleSaveTask = async () => {
    if (!taskDialog) return;
    setSavingTask(true);
    try {
      await addTask({
        lead_id: taskDialog.leadId,
        title: taskDialog.title,
        due_at: taskDueAt || undefined,
      });
      toast({ title: "Tarefa criada!" });
      setTaskDialog(null);
      setTaskDueAt("");
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingTask(false);
    }
  };

  const getIdleDays = (lead: any) => {
    const last = lead.last_contact_at || lead.created_at;
    return Math.floor((Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Central do Dia</h1>
          <p className="text-muted-foreground text-sm">{activeLeads.length} leads ativos • Ações priorizadas por IA</p>
        </div>
        <Button onClick={generateNBA} disabled={loadingNBA} className="gap-2">
          {loadingNBA ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {nbaResults.size ? "Atualizar sugestões" : "Gerar sugestões IA"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar lead..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Estágio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos estágios</SelectItem>
            {ACTIVE_STAGES.map((s) => {
              const info = FUNNEL_STAGES.find((f) => f.key === s);
              return <SelectItem key={s} value={s}>{info?.label}</SelectItem>;
            })}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="critico">Crítico</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
            <SelectItem value="atencao">Atenção</SelectItem>
            <SelectItem value="ok">OK</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant={onlyNoResponse ? "default" : "outline"}
          size="sm"
          className="h-9 gap-1.5 text-xs"
          onClick={() => setOnlyNoResponse(!onlyNoResponse)}
        >
          <Filter className="h-3 w-3" /> Sem resposta
        </Button>
      </div>

      {/* Lead list */}
      <div className="space-y-2">
        {filteredLeads.length === 0 && (
          <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum lead ativo encontrado</CardContent></Card>
        )}
        {filteredLeads.map((lead) => {
          const nba = nbaResults.get(lead.id);
          const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);
          const idleDays = getIdleDays(lead);
          const isDone = doneLeads.has(lead.id);
          const whatsappUrl = `https://wa.me/55${lead.phone.replace(/\D/g, "")}`;

          return (
            <Card key={lead.id} className={`transition-all ${isDone ? "opacity-50" : ""}`}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Lead info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm truncate">{lead.name}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0" style={{ borderColor: stageInfo?.color, color: stageInfo?.color }}>
                        {stageInfo?.label}
                      </Badge>
                      {nba && (
                        <Badge variant="outline" className={`text-[10px] shrink-0 ${priorityConfig[nba.priority]?.color}`}>
                          {priorityConfig[nba.priority]?.label}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {idleDays}d sem contato</span>
                      {lead.operator && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {lead.operator}</span>}
                      {lead.lives && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {lead.lives} vidas</span>}
                      <span>{lead.type}</span>
                    </div>
                    {nba && (
                      <p className="text-xs mt-1.5 text-primary/80 italic">💡 {nba.reason}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    {nba?.suggested_message && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1"
                        onClick={() => setMsgDialog({ leadId: lead.id, leadName: lead.name, message: nba.suggested_message! })}
                      >
                        <MessageCircle className="h-3 w-3" /> Mensagem
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1" asChild>
                      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                        <Phone className="h-3 w-3" /> WhatsApp
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      onClick={() => setTaskDialog({
                        leadId: lead.id,
                        leadName: lead.name,
                        title: nba?.suggested_task || "",
                      })}
                    >
                      <CalendarPlus className="h-3 w-3" /> Tarefa
                    </Button>
                    <Button
                      size="sm"
                      variant={isDone ? "secondary" : "default"}
                      className="h-8 text-xs gap-1"
                      disabled={isDone}
                      onClick={() => handleMarkDone(lead.id)}
                    >
                      <CheckCircle2 className="h-3 w-3" /> {isDone ? "Feito" : "Marcar feito"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Task creation dialog */}
      <Dialog open={!!taskDialog} onOpenChange={() => setTaskDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Criar tarefa — {taskDialog?.leadName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Título</Label>
              <Input
                value={taskDialog?.title || ""}
                onChange={(e) => setTaskDialog((prev) => prev ? { ...prev, title: e.target.value } : null)}
                className="h-9 text-sm"
                placeholder="Ex: Ligar para confirmar interesse"
              />
            </div>
            <div>
              <Label className="text-xs">Data limite (opcional)</Label>
              <Input type="datetime-local" value={taskDueAt} onChange={(e) => setTaskDueAt(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTaskDialog(null)}>Cancelar</Button>
            <Button size="sm" onClick={handleSaveTask} disabled={savingTask || !taskDialog?.title?.trim()}>
              {savingTask ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message dialog */}
      <Dialog open={!!msgDialog} onOpenChange={() => setMsgDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Mensagem sugerida — {msgDialog?.leadName}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={msgDialog?.message || ""}
            onChange={(e) => setMsgDialog((prev) => prev ? { ...prev, message: e.target.value } : null)}
            rows={5}
            className="text-sm"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={async () => {
              await navigator.clipboard.writeText(msgDialog?.message || "");
              toast({ title: "Copiado!" });
            }}>Copiar</Button>
            <Button size="sm" className="gap-1.5" asChild>
              <a href={`https://wa.me/55?text=${encodeURIComponent(msgDialog?.message || "")}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3 w-3" /> Enviar no WhatsApp
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
