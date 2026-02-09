import { Badge } from "@/components/ui/badge";
import { FunnelCard } from "./FunnelCard";
import type { FunnelStage } from "@/types/lead";

interface StageInfo {
  key: FunnelStage;
  label: string;
  color: string;
}

interface Props {
  stage: StageInfo;
  leads: any[];
  isDragOver: boolean;
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
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onLeadClick,
}: Props) {
  return (
    <div
      className="flex-shrink-0 w-72 flex flex-col"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Column Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-t-xl border border-b-0 border-border"
        style={{ borderTopColor: stage.color, borderTopWidth: 3 }}
      >
        <span className="text-xs font-bold uppercase tracking-wider truncate" style={{ color: stage.color }}>
          {stage.label}
        </span>
        <Badge
          variant="secondary"
          className="ml-auto text-[10px] h-5 min-w-[28px] justify-center font-bold"
        >
          {leads.length}
        </Badge>
      </div>

      {/* Column Body */}
      <div
        className={`flex-1 border border-border rounded-b-xl overflow-y-auto space-y-0 transition-colors ${
          isDragOver ? "bg-primary/5 border-primary/30" : "bg-muted/20"
        }`}
        style={{ maxHeight: "calc(100vh - 250px)" }}
      >
        {leads.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Nenhum lead
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
