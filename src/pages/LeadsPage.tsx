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
import { motion, AnimatePresence } from "framer-motion";
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

const AVATAR_GRADIENTS = [
  "from-blue-500 to-cyan-400",
  "from-purple-500 to-pink-400",
  "from-amber-500 to-orange-400",
  "from-emerald-500 to-teal-400",
  "from-rose-500 to-red-400",
  "from-indigo-500 to-violet-400",
];

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
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-muted-foreground">{leads.length} leads cadastrados</p>
        </div>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {selectedIds.size > 0 && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}>
                <Button variant="destructive" onClick={() => setConfirmOpen(true)} className="gap-2 btn-press">
                  <Trash2 className="h-4 w-4" /> Excluir ({selectedIds.size})
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2 btn-press">
            <Upload className="h-4 w-4" /> Importar
          </Button>
          <Button onClick={() => setFormOpen(true)} className="gap-2 bg-gradient-to-r from-primary to-blue-500 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 btn-press">
            <Plus className="h-4 w-4" /> Novo Lead
          </Button>
        </div>
      </motion.div>

      <LeadImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => {}} />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 focus-ring-animated"
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
        {filtered.map((lead, i) => {
          const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);
          const isSelected = selectedIds.has(lead.id);
          const gradientIdx = lead.name.charCodeAt(0) % AVATAR_GRADIENTS.length;
          const initials = lead.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2);
          return (
            <motion.div
              key={lead.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
            >
              <Card
                className={`cursor-pointer hover-card-lift transition-all border-border/50 ${isSelected ? "ring-2 ring-primary/50 shadow-md shadow-primary/10" : ""}`}
                onClick={() => setSelectedLead(lead)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(lead.id)} />
                  </div>
                  <div className={`h-10 w-10 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[gradientIdx]} flex items-center justify-center shrink-0 shadow-sm`}>
                    <span className="text-white font-semibold text-sm">{initials}</span>
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
                      className="text-[10px] gap-1"
                      style={{ borderColor: stageInfo?.color, color: stageInfo?.color }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ backgroundColor: stageInfo?.color }} />
                      {stageInfo?.label}
                    </Badge>
                    <a
                      href={buildWhatsAppUrl(lead.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
        {filtered.length === 0 && leads.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-16 text-center space-y-3"
          >
            <Users className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="font-medium">Nenhum lead cadastrado</p>
              <p className="text-sm text-muted-foreground">
                Crie seu primeiro lead para começar a gerenciar.
              </p>
            </div>
            <Button onClick={() => setFormOpen(true)} className="gap-2 bg-gradient-to-r from-primary to-blue-500 btn-press">
              <Plus className="h-4 w-4" /> Criar Lead
            </Button>
          </motion.div>
        )}
        {filtered.length === 0 && leads.length > 0 && (
          <div className="text-center py-12 text-muted-foreground animate-fade-in">
            Nenhum lead encontrado para "{search}"
          </div>
        )}
      </div>

      <LeadFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <LeadDetailSheet lead={selectedLead} onClose={() => setSelectedLead(null)} />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="animate-scale-in">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedIds.size} lead(s)? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="btn-press">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 btn-press"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
