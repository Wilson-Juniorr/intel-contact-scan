import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { FUNNEL_STAGES, FunnelStage } from "@/types/lead";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LeadDetailSheet } from "@/components/leads/LeadDetailSheet";
import { FunnelColumn } from "@/components/funnel/FunnelColumn";
import { BootstrapWhatsAppDialog } from "@/components/leads/BootstrapWhatsAppDialog";
import { QuoteConfirmDialog } from "@/components/leads/QuoteConfirmDialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Search, X, CalendarIcon, Zap } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Stages that require quote_min_value
const STAGES_REQUIRE_QUOTE: FunnelStage[] = ["cotacao_enviada"];
// Stages that require approved_value
const STAGES_REQUIRE_APPROVED: FunnelStage[] = ["cotacao_aprovada", "documentacao_completa", "em_emissao"];

export default function FunnelPage() {
  const { leads, moveStage, updateLead, deleteLeads } = useLeadsContext();
  const queryClient = useQueryClient();
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<FunnelStage | null>(null);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null);

  // Quote dialog state
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [quoteDialogMode, setQuoteDialogMode] = useState<"quote" | "approved">("quote");
  const [pendingMove, setPendingMove] = useState<{ leadId: string; stage: FunnelStage } | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const operators = useMemo(() => {
    const ops = new Set(leads.map((l) => l.operator).filter(Boolean));
    return Array.from(ops) as string[];
  }, [leads]);

  const hasActiveFilters = search || typeFilter !== "all" || operatorFilter !== "all" || dateFrom || dateTo;

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (search && !l.name.toLowerCase().includes(search.toLowerCase()) && !l.phone.includes(search) && !(l.email && l.email.toLowerCase().includes(search.toLowerCase()))) return false;
      if (typeFilter !== "all" && l.type !== typeFilter) return false;
      if (operatorFilter !== "all" && l.operator !== operatorFilter) return false;
      if (dateFrom && new Date(l.created_at) < dateFrom) return false;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (new Date(l.created_at) > end) return false;
      }
      return true;
    });
  }, [leads, search, typeFilter, operatorFilter, dateFrom, dateTo]);

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setOperatorFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;

  const handleDragStart = (leadId: string) => {
    setDraggedLeadId(leadId);
  };

  const handleDragOver = (e: React.DragEvent, stage: FunnelStage) => {
    e.preventDefault();
    setDragOverStage(stage);
  };

  const handleDragLeave = () => {
    setDragOverStage(null);
  };

  // Auto-extract quote data state
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [extractedQuoteData, setExtractedQuoteData] = useState<{ min_value: number | null; operadora: string | null; plan_name: string | null; confidence: number } | null>(null);

  const tryMoveStage = useCallback(async (leadId: string, stage: FunnelStage) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage === stage) return;

    // Check if quote_min_value is needed — auto-extract from history
    if (STAGES_REQUIRE_QUOTE.includes(stage) && !lead.quote_min_value) {
      setPendingMove({ leadId, stage });
      setQuoteDialogMode("quote");
      setExtractedQuoteData(null);
      setQuoteLoading(true);
      setQuoteDialogOpen(true);

      // Fire async extraction from lead history
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const resp = await supabase.functions.invoke("extract-quote-data", {
            body: { lead_id: leadId },
          });
          if (resp.data) {
            setExtractedQuoteData(resp.data);
          }
        }
      } catch (err) {
        console.error("Auto-extract quote error:", err);
      } finally {
        setQuoteLoading(false);
      }
      return;
    }

    // Check if approved_value is needed
    if (STAGES_REQUIRE_APPROVED.includes(stage) && !lead.approved_value) {
      setPendingMove({ leadId, stage });
      setQuoteDialogMode("approved");
      setQuoteDialogOpen(true);
      return;
    }

    moveStage(leadId, stage);

    // Auto-start closing sequence when moving to cotacao_enviada
    if (stage === "cotacao_enviada") {
      try {
        await supabase.functions.invoke("closing-engine", {
          body: { action: "create", lead_id: leadId },
        });
      } catch (err) {
        console.error("Auto-start closing sequence error:", err);
      }
    }
  }, [leads, moveStage]);

  const handleDrop = (stage: FunnelStage) => {
    if (draggedLeadId) {
      tryMoveStage(draggedLeadId, stage);
    }
    setDraggedLeadId(null);
    setDragOverStage(null);
  };

  const handleQuoteConfirm = async (data: { min_value?: number; operadora?: string; plan_name?: string; approved_value?: number }) => {
    if (!pendingMove) return;
    try {
      const updates: Record<string, unknown> = {};

      if (data.min_value !== undefined && data.min_value > 0) {
        updates.quote_min_value = data.min_value;
        updates.last_quote_sent_at = new Date().toISOString();
      }
      if (data.operadora) updates.quote_operadora = data.operadora;
      if (data.plan_name) updates.quote_plan_name = data.plan_name;
      if (data.approved_value !== undefined) {
        updates.approved_value = data.approved_value;
      }

      if (Object.keys(updates).length > 0) {
        await updateLead(pendingMove.leadId, updates);
      }
      await moveStage(pendingMove.leadId, pendingMove.stage);
      toast.success("Etapa atualizada!");
    } catch {
      toast.error("Erro ao atualizar lead");
    }
    setQuoteDialogOpen(false);
    setPendingMove(null);
  };

  return (
    <div className="h-[calc(100vh-4.5rem)] flex flex-col gap-3">
      {/* Top bar */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-foreground tracking-tight">Pipeline de Vendas</h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Arraste os cards entre as colunas · {filteredLeads.length} de {leads.length} negócios
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground gap-1">
                <X className="h-3 w-3" /> Limpar filtros
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setBootstrapOpen(true)} className="text-xs gap-1.5 h-8">
              <Zap className="h-3.5 w-3.5" /> Criar negócios do WhatsApp
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar por nome, telefone ou email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="PF">PF</SelectItem>
              <SelectItem value="ADESAO">Adesão</SelectItem>
              <SelectItem value="PME">PME</SelectItem>
            </SelectContent>
          </Select>
          <Select value={operatorFilter} onValueChange={setOperatorFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Operadora" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas operadoras</SelectItem>
              {operators.map((op) => (<SelectItem key={op} value={op}>{op}</SelectItem>))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1.5", dateFrom && "text-foreground")}>
                <CalendarIcon className="h-3 w-3" />
                {dateFrom ? format(dateFrom, "dd/MM/yy", { locale: ptBR }) : "De"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1.5", dateTo && "text-foreground")}>
                <CalendarIcon className="h-3 w-3" />
                {dateTo ? format(dateTo, "dd/MM/yy", { locale: ptBR }) : "Até"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Pipeline columns */}
      <div className="flex-1 flex gap-px overflow-x-auto bg-border/50 rounded-lg border border-border">
        {FUNNEL_STAGES.map((stage, index) => {
          const stageLeads = filteredLeads.filter((l) => l.stage === stage.key);
          return (
            <FunnelColumn
              key={stage.key}
              stage={stage}
              leads={stageLeads}
              isDragOver={dragOverStage === stage.key}
              isFirst={index === 0}
              isLast={index === FUNNEL_STAGES.length - 1}
              onDragStart={handleDragStart}
              onDragOver={(e) => handleDragOver(e, stage.key)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(stage.key)}
              onLeadClick={(id) => setSelectedLeadId(id)}
              onDeleteLead={(id) => setDeleteLeadId(id)}
              onMoveStage={(id, stage) => tryMoveStage(id, stage)}
            />
          );
        })}
      </div>

      <LeadDetailSheet lead={selectedLead} onClose={() => setSelectedLeadId(null)} />
      <BootstrapWhatsAppDialog open={bootstrapOpen} onOpenChange={setBootstrapOpen} onComplete={() => queryClient.invalidateQueries({ queryKey: ["leads"] })} />
      
      <QuoteConfirmDialog
        open={quoteDialogOpen}
        onOpenChange={(open) => {
          setQuoteDialogOpen(open);
          if (!open) setPendingMove(null);
        }}
        quoteData={extractedQuoteData}
        loading={quoteLoading}
        mode={quoteDialogMode}
        onConfirm={handleQuoteConfirm}
      />

      <AlertDialog open={!!deleteLeadId} onOpenChange={(open) => { if (!open) setDeleteLeadId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir negócio</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{leads.find(l => l.id === deleteLeadId)?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteLeadId) {
                  try {
                    await deleteLeads([deleteLeadId]);
                    toast.success("Negócio excluído!");
                  } catch {
                    toast.error("Erro ao excluir negócio");
                  }
                }
                setDeleteLeadId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
