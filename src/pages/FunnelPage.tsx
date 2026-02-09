import { useState } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { FUNNEL_STAGES, FunnelStage, Lead } from "@/types/lead";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, GripVertical } from "lucide-react";
import { LeadDetailSheet } from "@/components/leads/LeadDetailSheet";

export default function FunnelPage() {
  const { leads, moveStage } = useLeadsContext();
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const handleDragStart = (lead: Lead) => {
    setDraggedLead(lead);
  };

  const handleDrop = (stage: FunnelStage) => {
    if (draggedLead && draggedLead.stage !== stage) {
      moveStage(draggedLead.id, stage);
    }
    setDraggedLead(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Funil de Vendas</h1>
        <p className="text-sm text-muted-foreground">Arraste os cards para mover entre etapas</p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 200px)" }}>
        {FUNNEL_STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.stage === stage.key);
          return (
            <div
              key={stage.key}
              className="flex-shrink-0 w-64 flex flex-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage.key)}
            >
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                <span className="text-sm font-semibold">{stage.label}</span>
                <Badge variant="secondary" className="ml-auto text-[10px] h-5">
                  {stageLeads.length}
                </Badge>
              </div>

              <div className="flex-1 space-y-2 bg-muted/30 rounded-xl p-2 min-h-[100px]">
                {stageLeads.map((lead) => (
                  <Card
                    key={lead.id}
                    draggable
                    onDragStart={() => handleDragStart(lead)}
                    onClick={() => setSelectedLead(lead)}
                    className="cursor-grab active:cursor-grabbing hover:bg-muted/50 transition-colors"
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <p className="font-medium text-sm leading-tight">{lead.name}</p>
                        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>{lead.phone}</span>
                      </div>
                      {lead.operator && (
                        <Badge variant="outline" className="text-[10px]">
                          {lead.operator}
                        </Badge>
                      )}
                      <div className="flex items-center justify-between">
                        {lead.lives && (
                          <span className="text-[10px] text-muted-foreground">{lead.lives} vidas</span>
                        )}
                        <a
                          href={`https://wa.me/55${lead.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded hover:bg-secondary/20 text-secondary"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      {lead.stage === "perdido" && lead.lost_reason && (
                        <p className="text-[10px] text-destructive">Motivo: {lead.lost_reason}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <LeadDetailSheet lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
