import { useState } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { FUNNEL_STAGES, Lead } from "@/types/lead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Phone, MessageCircle, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LeadFormDialog } from "@/components/leads/LeadFormDialog";
import { LeadDetailSheet } from "@/components/leads/LeadDetailSheet";

export default function LeadsPage() {
  const { leads } = useLeadsContext();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const filtered = leads.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.phone.includes(search)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">{leads.length} leads cadastrados</p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Lead
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="space-y-2">
        {filtered.map((lead) => {
          const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);
          return (
            <Card
              key={lead.id}
              className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setSelectedLead(lead)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-semibold text-sm">
                    {lead.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{lead.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{lead.phone}</span>
                    {lead.operator && <span>• {lead.operator}</span>}
                    {lead.lives && <span>• {lead.lives} vidas</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-[10px]" style={{ borderColor: stageInfo?.color, color: stageInfo?.color }}>
                    {stageInfo?.label}
                  </Badge>
                  <a
                    href={`https://wa.me/55${lead.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 rounded-md hover:bg-secondary/20 text-secondary"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Nenhum lead encontrado
          </div>
        )}
      </div>

      <LeadFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <LeadDetailSheet lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
}
