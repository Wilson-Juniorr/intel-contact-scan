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
  return (
    <div
      className="flex-1 min-w-[220px] max-w-[320px] flex flex-col border-r border-border last:border-r-0"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* HubSpot-style header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b-2 bg-muted/30" style={{ borderBottomColor: stage.color }}>
        <span
          className="text-[11px] font-bold uppercase tracking-wider truncate"
          style={{ color: stage.color }}
        >
          {stage.label}
        </span>
        <span
          className="ml-1 text-[10px] font-bold rounded px-1.5 py-0.5 min-w-[24px] text-center"
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

      {/* Cards area */}
      <div
        className={`flex-1 overflow-y-auto transition-colors ${
          isDragOver ? "bg-primary/5" : "bg-background"
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
    </div>
  );
}
