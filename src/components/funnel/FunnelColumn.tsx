import { FunnelCard } from "./FunnelCard";
import type { FunnelStage } from "@/types/lead";
import { ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { AnimatePresence } from "framer-motion";

interface StageInfo {
  key: FunnelStage;
  label: string;
  color: string;
  weight: number;
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
  const totalValue = leads.reduce((sum, l) => sum + (l.lives ? l.lives * 120 : 0), 0);
  const weightedValue = Math.round(totalValue * stage.weight / 100);

  const formatCurrency = (v: number) => {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")} mi`;
    return `R$ ${v.toLocaleString("pt-BR")}`;
  };

  return (
    <div
      className="flex-1 min-w-[220px] max-w-[280px] flex flex-col bg-muted/20"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 bg-muted/50 border-b border-border">
        {!isFirst && (
          <button className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground shrink-0">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="text-[11px] font-extrabold uppercase tracking-wider truncate" style={{ color: stage.color }}>
          {stage.label}
        </span>
        <span
          className="text-[10px] font-bold rounded px-1.5 py-0.5 min-w-[28px] text-center shrink-0"
          style={{ backgroundColor: stage.color, color: "#fff" }}
        >
          {leads.length}
        </span>
        <div className="ml-auto flex items-center gap-0.5 shrink-0">
          <button className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground">
            <ArrowUpDown className="h-3 w-3" />
          </button>
          <button className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Cards */}
      <div
        className={`flex-1 overflow-y-auto transition-colors ${
          isDragOver ? "bg-primary/5" : ""
        }`}
      >
        {leads.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground italic">
            Nenhum negócio
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {leads.map((lead) => (
            <FunnelCard
              key={lead.id}
              lead={lead}
              stageColor={stage.color}
              onDragStart={() => onDragStart(lead.id)}
              onClick={() => onLeadClick(lead.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Footer totals */}
      <div className="px-2.5 py-1.5 border-t border-border bg-muted/40 text-[10px] text-muted-foreground leading-relaxed">
        <div>
          <span className="font-semibold text-foreground">{formatCurrency(totalValue)}</span>
          {" "}| Valor total
        </div>
        <div>
          <span className="font-semibold text-foreground">{formatCurrency(weightedValue)}</span>
          {" "}({stage.weight}%) | Valor ponderado <span className="opacity-50">ⓘ</span>
        </div>
      </div>
    </div>
  );
}
