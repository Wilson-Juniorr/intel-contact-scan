import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, Sparkles, Search } from "lucide-react";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { useSalesTechniques, TECHNIQUE_CATEGORIES, type SalesTechnique } from "@/hooks/useSalesTechniques";
import { SalesTechniqueDialog } from "./SalesTechniqueDialog";

function DynamicIcon({ name, ...props }: { name: string } & React.ComponentProps<typeof Sparkles>) {
  const Icon = (Icons as any)[name] || Sparkles;
  return <Icon {...props} />;
}

export function AgentsTechniquesTab() {
  const { techniques, loading, upsert, remove, toggleActive } = useSalesTechniques();
  const [editing, setEditing] = useState<SalesTechnique | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<SalesTechnique | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return techniques.filter((t) => {
      if (filter !== "all" && t.categoria !== filter) return false;
      if (search && !`${t.nome} ${t.descricao} ${t.fonte_autor}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [techniques, filter, search]);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Técnicas de Venda</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Biblioteca reutilizável — anexe a qualquer agente.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="btn-press bg-gradient-to-r from-primary to-blue-500">
          <Plus className="h-4 w-4 mr-1" /> Nova técnica
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar técnica…" className="pl-8 h-9" />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")} className="h-8">Todas ({techniques.length})</Button>
          {TECHNIQUE_CATEGORIES.map((c) => {
            const count = techniques.filter((t) => t.categoria === c.value).length;
            return (
              <Button key={c.value} variant={filter === c.value ? "default" : "outline"} size="sm" onClick={() => setFilter(c.value)} className="h-8">
                {c.label} ({count})
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((t, i) => {
          const cat = TECHNIQUE_CATEGORIES.find((c) => c.value === t.categoria);
          return (
            <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="hover-card-lift border-border/50 overflow-hidden h-full">
                <div className="h-1" style={{ backgroundColor: t.cor_hex }} />
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.cor_hex}22` }}>
                      <DynamicIcon name={t.icone} className="h-4 w-4" style={{ color: t.cor_hex }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-semibold text-sm truncate">{t.nome}</h3>
                        {t.is_default && <Badge variant="outline" className="text-[8px] h-3.5 px-1">PADRÃO</Badge>}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {cat && <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{cat.label}</Badge>}
                        <span className="text-[10px] text-muted-foreground">Lvl {t.nivel_dificuldade}</span>
                      </div>
                    </div>
                    <Switch checked={t.ativo} onCheckedChange={() => toggleActive(t)} />
                  </div>

                  {t.descricao && <p className="text-[11px] text-muted-foreground line-clamp-2">{t.descricao}</p>}

                  {t.fonte_autor && <p className="text-[10px] text-muted-foreground/70 italic">— {t.fonte_autor}</p>}

                  <div className="flex items-center gap-1 pt-1">
                    <Button variant="outline" size="sm" onClick={() => setEditing(t)} className="btn-press flex-1 h-7 text-xs">
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeleting(t)} className="btn-press h-7 w-7 p-0 text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma técnica encontrada com esses filtros.</div>
      )}

      <SalesTechniqueDialog
        technique={editing}
        open={!!editing || creating}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSave={upsert}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {deleting?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso vai desconectar essa técnica de TODOS os agentes que a usam.
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