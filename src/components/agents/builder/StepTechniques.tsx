import { useSalesTechniques, TECHNIQUE_CATEGORIES } from "@/hooks/useSalesTechniques";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { BuilderState } from "@/lib/agents/promptBuilder";
import { Sparkles } from "lucide-react";

export function StepTechniques({ state, set }: { state: BuilderState; set: (p: Partial<BuilderState>) => void }) {
  const { techniques, loading } = useSalesTechniques();

  const toggle = (id: string) => {
    const exists = state.techniques.find((t) => t.id === id);
    if (exists) set({ techniques: state.techniques.filter((t) => t.id !== id) });
    else set({ techniques: [...state.techniques, { id, prioridade: 5 }] });
  };

  const setPri = (id: string, prioridade: number) => {
    set({ techniques: state.techniques.map((t) => (t.id === id ? { ...t, prioridade } : t)) });
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando técnicas…</p>;

  const grouped = TECHNIQUE_CATEGORIES.map((cat) => ({
    ...cat,
    items: techniques.filter((t) => t.categoria === cat.value),
  }));

  return (
    <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
      <p className="text-sm text-muted-foreground">
        Selecione as técnicas que o agent deve aplicar. A prioridade define o quanto ela puxa nas respostas.
      </p>
      {grouped.map((g) =>
        g.items.length === 0 ? null : (
          <div key={g.value}>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: g.color }} /> {g.label}
            </h4>
            <div className="grid gap-2">
              {g.items.map((t) => {
                const sel = state.techniques.find((x) => x.id === t.id);
                return (
                  <Card key={t.id} className={`p-3 ${sel ? "border-primary/60 bg-primary/5" : "border-border/50"}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox checked={!!sel} onCheckedChange={() => toggle(t.id)} className="mt-1" />
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${t.cor_hex}20`, color: t.cor_hex }}>
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">{t.nome}</span>
                          <Badge variant="outline" className="text-[10px]">nv {t.nivel_dificuldade}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.descricao}</p>
                        {sel && (
                          <div className="mt-2 flex items-center gap-3">
                            <Label className="text-[11px] text-muted-foreground w-24">Prioridade: {sel.prioridade}/10</Label>
                            <Slider value={[sel.prioridade]} min={1} max={10} step={1} onValueChange={(v) => setPri(t.id, v[0])} className="flex-1" />
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ),
      )}
    </div>
  );
}