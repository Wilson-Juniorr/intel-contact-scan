import { useState } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { FUNNEL_STAGES, Lead } from "@/types/lead";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, MessageCircle, ChevronRight, Trash2, Users, Upload } from "lucide-react";
import { LeadImportDialog } from "@/components/leads/LeadImportDialog";
import { LeadFormDialog } from "@/components/leads/LeadFormDialog";
import { LeadDetailSheet } from "@/components/leads/LeadDetailSheet";
import { toast } from "sonner";
import { buildWhatsAppUrl } from "@/lib/phone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function LeadsPage() {
  const { leads, deleteLeads } = useLeadsContext();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const filtered = leads.filter(
    (l) => l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search)
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((l) => l.id)));
    }
  };

  const handleDelete = async () => {
    try {
      await deleteLeads(Array.from(selectedIds));
      toast.success(`${selectedIds.size} lead(s) excluído(s)`);
      setSelectedIds(new Set());
    } catch {
      toast.error("Erro ao excluir leads");
    }
    setConfirmOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">{leads.length} leads cadastrados</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => setConfirmOpen(true)} className="gap-2">
              <Trash2 className="h-4 w-4" /> Excluir ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" /> Importar
          </Button>
          <Button onClick={() => setFormOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Lead
          </Button>
        </div>
      </div>

      <LeadImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => {}} />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <Checkbox
            checked={selectedIds.size === filtered.length && filtered.length > 0}
            onCheckedChange={toggleAll}
          />
          <span className="text-xs text-muted-foreground">Selecionar todos</span>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((lead) => {
          const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);
          const isSelected = selectedIds.has(lead.id);
          return (
            <Card
              key={lead.id}
              className={`cursor-pointer hover:bg-muted/30 transition-colors ${isSelected ? "ring-1 ring-primary" : ""}`}
              onClick={() => setSelectedLead(lead)}
            >
              <CardContent className="p-4 flex items-center gap-4">
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(lead.id)} />
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-semibold text-sm">
                    {lead.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .slice(0, 2)}
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
                  <Badge
                    variant="outline"
                    className="text-[10px]"
                    style={{ borderColor: stageInfo?.color, color: stageInfo?.color }}
                  >
                    {stageInfo?.label}
                  </Badge>
                  <a
                    href={buildWhatsAppUrl(lead.phone)}
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
        {filtered.length === 0 && leads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <Users className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Nenhum lead cadastrado</p>
              <p className="text-sm text-muted-foreground">
                Crie seu primeiro lead para começar a gerenciar.
              </p>
            </div>
            <Button onClick={() => setFormOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Criar Lead
            </Button>
          </div>
        )}
        {filtered.length === 0 && leads.length > 0 && (
          <div className="text-center py-12 text-muted-foreground">
            Nenhum lead encontrado para "{search}"
          </div>
        )}
      </div>

      <LeadFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <LeadDetailSheet lead={selectedLead} onClose={() => setSelectedLead(null)} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedIds.size} lead(s)? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
