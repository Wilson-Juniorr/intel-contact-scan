import { useState } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { FUNNEL_STAGES, FunnelStage } from "@/types/lead";
import { Badge } from "@/components/ui/badge";
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
    <div className="space-y-4 h-[calc(100vh-7rem)] flex flex-col">
      <div>
        <h1 className="text-2xl font-bold">Funil de Vendas</h1>
        <p className="text-sm text-muted-foreground">
          Arraste os cards entre as colunas • {leads.length} leads no total
        </p>
      </div>

      <div className="flex-1 flex gap-3 overflow-x-auto pb-2">
        {FUNNEL_STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.stage === stage.key);
          return (
            <FunnelColumn
              key={stage.key}
              stage={stage}
              leads={stageLeads}
              isDragOver={dragOverStage === stage.key}
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
