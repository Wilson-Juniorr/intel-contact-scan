import { FunnelCard } from "./FunnelCard";
import type { FunnelStage } from "@/types/lead";
import { ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";

interface StageInfo {
  key: FunnelStage;
  label: string;
  color: string;
}

interface Props {
  stage: StageInfo;
  leads: any[];
  isDragOver: boolean;
  isFirst: boolean;
  isLast: boolean;
  onDragStart: (leadId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onLeadClick: (id: string) => void;
}

export function FunnelColumn({
  stage,
  leads,
  isDragOver,
  isFirst,
  isLast,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onLeadClick,
}: Props) {
  // Calculate totals
  const totalValue = leads.reduce((sum, l) => sum + (l.lives ? l.lives * 120 : 0), 0);
  const weightedPercent = stage.key === "convertido" ? 100 : stage.key === "perdido" ? 0 :
    stage.key === "novo" ? 10 : stage.key === "primeiro_contato" ? 10 :
    stage.key === "cotacao_enviada" ? 20 : stage.key === "em_negociacao" ? 50 :
    stage.key === "proposta_aceita" ? 70 : 80;
  const weightedValue = Math.round(totalValue * weightedPercent / 100);

  return (
    <div
      className="flex-1 min-w-[230px] max-w-[300px] flex flex-col border-r border-border last:border-r-0"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/40 border-b border-border">
        <span className="text-[11px] font-extrabold uppercase tracking-wider truncate" style={{ color: stage.color }}>
          {stage.label}
        </span>
        <span
          className="text-[10px] font-bold rounded px-1.5 py-0.5 min-w-[24px] text-center"
          style={{ backgroundColor: stage.color, color: "#fff" }}
        >
          {leads.length}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground">
            <ArrowUpDown className="h-3 w-3" />
          </button>
          <button className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground">
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground">
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Cards */}
      <div
        className={`flex-1 overflow-y-auto py-1 transition-colors ${
          isDragOver ? "bg-primary/5" : "bg-muted/10"
        }`}
      >
        {leads.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground italic">
            Nenhum negócio
          </div>
        )}
        {leads.map((lead) => (
          <FunnelCard
            key={lead.id}
            lead={lead}
            stageColor={stage.color}
            onDragStart={() => onDragStart(lead.id)}
            onClick={() => onLeadClick(lead.id)}
          />
        ))}
      </div>

      {/* Footer with totals - HubSpot style */}
      <div className="px-3 py-2 border-t border-border bg-muted/30 text-[10px] text-muted-foreground space-y-0.5">
        <div>
          <span className="font-semibold text-foreground">R$ {totalValue.toLocaleString("pt-BR")}</span>
          {" "}| Valor total
        </div>
        <div>
          <span className="font-semibold text-foreground">R$ {weightedValue.toLocaleString("pt-BR")}</span>
          {" "}({weightedPercent}%) | Valor ponderado
        </div>
      </div>
    </div>
  );
}
