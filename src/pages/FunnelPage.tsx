import { useState, useMemo } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { FUNNEL_STAGES, FunnelStage } from "@/types/lead";
import { LeadDetailSheet } from "@/components/leads/LeadDetailSheet";
import { FunnelColumn } from "@/components/funnel/FunnelColumn";
import { BootstrapWhatsAppDialog } from "@/components/leads/BootstrapWhatsAppDialog";
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

export default function FunnelPage() {
  const { leads, moveStage } = useLeadsContext();
  const queryClient = useQueryClient();
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<FunnelStage | null>(null);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);

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

  const handleDrop = (stage: FunnelStage) => {
    if (draggedLeadId) {
      const lead = leads.find((l) => l.id === draggedLeadId);
      if (lead && lead.stage !== stage) {
        moveStage(draggedLeadId, stage);
      }
    }
    setDraggedLeadId(null);
    setDragOverStage(null);
  };

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col">
      {/* Top bar */}
      <div className="px-1 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold text-foreground">Pipeline de Vendas</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Arraste os cards entre as colunas • {filteredLeads.length} de {leads.length} negócios
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
            <Input
              placeholder="Buscar por nome, telefone ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="PF">PF</SelectItem>
              <SelectItem value="ADESAO">Adesão</SelectItem>
              <SelectItem value="PME">PME</SelectItem>
            </SelectContent>
          </Select>

          <Select value={operatorFilter} onValueChange={setOperatorFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Operadora" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas operadoras</SelectItem>
              {operators.map((op) => (
                <SelectItem key={op} value={op}>{op}</SelectItem>
              ))}
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
      <div className="flex-1 flex gap-0 overflow-x-auto">
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
            />
          );
        })}
      </div>

      <LeadDetailSheet lead={selectedLead} onClose={() => setSelectedLeadId(null)} />
      <BootstrapWhatsAppDialog
        open={bootstrapOpen}
        onOpenChange={setBootstrapOpen}
        onComplete={() => queryClient.invalidateQueries({ queryKey: ["leads"] })}
      />
    </div>
  );
}
