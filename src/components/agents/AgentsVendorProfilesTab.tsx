import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Brain, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { useVendorProfiles, type VendorProfile } from "@/hooks/useVendorProfiles";
import { VendorProfileDialog } from "./VendorProfileDialog";

function DynamicIcon({ name, ...props }: { name: string } & React.ComponentProps<typeof Brain>) {
  const Icon = (Icons as any)[name] || Brain;
  return <Icon {...props} />;
}

export function AgentsVendorProfilesTab() {
  const { profiles, loading, upsert, remove, toggleActive } = useVendorProfiles();
  const [editing, setEditing] = useState<VendorProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<VendorProfile | null>(null);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> Cérebros de Vendedor</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Mestres da venda que seus agentes incorporam — Voss, Braun, Ortega, Concer ou os seus próprios.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="btn-press bg-gradient-to-r from-primary to-blue-500">
          <Plus className="h-4 w-4 mr-1" /> Novo cérebro
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {profiles.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="hover-card-lift border-border/50 overflow-hidden h-full">
              <div className="h-1" style={{ backgroundColor: p.cor_hex }} />
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${p.cor_hex}22` }}>
                    <DynamicIcon name={p.icone} className="h-5 w-5" style={{ color: p.cor_hex }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{p.nome}</h3>
                      {p.is_default && <Badge variant="outline" className="text-[9px] h-4 border-amber-500/40 text-amber-600 dark:text-amber-400">PADRÃO</Badge>}
                    </div>
                    {p.origem && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{p.origem}</p>}
                  </div>
                  <Switch checked={p.ativo} onCheckedChange={() => toggleActive(p)} />
                </div>

                {p.descricao && <p className="text-xs text-muted-foreground line-clamp-2">{p.descricao}</p>}

                <div className="flex items-center gap-1.5 flex-wrap">
                  {p.tom && <Badge variant="secondary" className="text-[10px]"><Sparkles className="h-2.5 w-2.5 mr-1" />{p.tom}</Badge>}
                  {p.tags.slice(0, 3).map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                </div>

                {p.exemplos_frases.length > 0 && (
                  <div className="border-t border-border/40 pt-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Frase</p>
                    <p className="text-xs italic text-foreground/80">"{p.exemplos_frases[0]}"</p>
                  </div>
                )}

                <div className="flex items-center gap-1.5 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setEditing(p)} className="btn-press flex-1">
                    <Pencil className="h-3 w-3 mr-1" /> Editar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDeleting(p)} className="btn-press text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <VendorProfileDialog
        profile={editing}
        open={!!editing || creating}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSave={upsert}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {deleting?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai desconectar esse cérebro de TODOS os agentes que o usam. Não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleting) { remove(deleting.id); setDeleting(null); } }} className="bg-destructive hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}