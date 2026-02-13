import { FunnelCard } from "./FunnelCard";
import type { FunnelStage } from "@/types/lead";
import { AnimatePresence, motion } from "framer-motion";

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
  onDeleteLead: (id: string) => void;
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
  onDeleteLead,
}: Props) {
  const totalValue = leads.reduce((sum, l) => {
    if (l.approved_value) return sum + Number(l.approved_value);
    if (l.quote_min_value) return sum + Number(l.quote_min_value);
    return sum + (l.lives ? l.lives * 120 : 0);
  }, 0);
  const weightedValue = Math.round(totalValue * stage.weight / 100);

  const formatCurrency = (v: number) => {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")} mi`;
    return `R$ ${v.toLocaleString("pt-BR")}`;
  };

  return (
    <div
      className="flex-1 min-w-[240px] max-w-[290px] flex flex-col"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header – sticky */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="px-3 py-2.5 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground truncate">
            {stage.label}
          </span>
          <span
            className="ml-auto text-[10px] font-bold rounded-full px-2 py-0.5 min-w-[24px] text-center"
            style={{ backgroundColor: stage.color + "18", color: stage.color }}
          >
            {leads.length}
          </span>
        </div>
      </div>

      {/* Cards area */}
      <motion.div
        className={`flex-1 overflow-y-auto px-1.5 py-1.5 transition-colors duration-200 ${
          isDragOver ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""
        }`}
        animate={isDragOver ? { scale: 1.005 } : { scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        {leads.length === 0 && (
          <div className="p-8 text-center text-xs text-muted-foreground/60 italic">
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
              onDelete={onDeleteLead}
            />
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Footer totals */}
      <div className="px-3 py-2 border-t border-border bg-muted/30 text-[10px] text-muted-foreground leading-relaxed">
        <div className="flex items-center justify-between">
          <span>Valor total</span>
          <span className="font-semibold text-foreground">{formatCurrency(totalValue)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Ponderado ({stage.weight}%)</span>
          <span className="font-semibold text-foreground">{formatCurrency(weightedValue)}</span>
        </div>
      </div>
    </div>
  );
}
