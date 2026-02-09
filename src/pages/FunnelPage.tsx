import { useState } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { FUNNEL_STAGES, FunnelStage } from "@/types/lead";
import { LeadDetailSheet } from "@/components/leads/LeadDetailSheet";
import { FunnelColumn } from "@/components/funnel/FunnelColumn";

export default function FunnelPage() {
  const { leads, moveStage } = useLeadsContext();
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<FunnelStage | null>(null);

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
      <div className="flex items-center justify-between px-1 pb-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Pipeline de Vendas</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Arraste os cards entre as colunas • {leads.length} negócios
          </p>
        </div>
      </div>

      {/* Pipeline columns */}
      <div className="flex-1 flex gap-0 overflow-x-auto">
        {FUNNEL_STAGES.map((stage, index) => {
          const stageLeads = leads.filter((l) => l.stage === stage.key);
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
    </div>
  );
}
