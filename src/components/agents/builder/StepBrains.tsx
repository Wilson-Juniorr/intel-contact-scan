import { useVendorProfiles } from "@/hooks/useVendorProfiles";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { BuilderState } from "@/lib/agents/promptBuilder";
import { Brain } from "lucide-react";

export function StepBrains({ state, set }: { state: BuilderState; set: (p: Partial<BuilderState>) => void }) {
  const { profiles, loading } = useVendorProfiles();

  const toggle = (id: string) => {
    const exists = state.brains.find((b) => b.id === id);
    if (exists) set({ brains: state.brains.filter((b) => b.id !== id) });
    else set({ brains: [...state.brains, { id, peso: 5 }] });
  };

  const setPeso = (id: string, peso: number) => {
    set({ brains: state.brains.map((b) => (b.id === id ? { ...b, peso } : b)) });
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando cérebros…</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Escolha os especialistas que vão formar o jeito de pensar deste agent. Ajuste o peso de cada um (10 = dominante, 1 = só um tempero).
      </p>
      <div className="grid gap-2 max-h-[420px] overflow-y-auto pr-1">
        {profiles.map((p) => {
          const sel = state.brains.find((b) => b.id === p.id);
          return (
            <Card key={p.id} className={`p-3 transition ${sel ? "border-primary/60 bg-primary/5" : "border-border/50"}`}>
              <div className="flex items-start gap-3">
                <Checkbox checked={!!sel} onCheckedChange={() => toggle(p.id)} className="mt-1" />
                <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${p.cor_hex}20`, color: p.cor_hex }}>
                  <Brain className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{p.nome}</span>
                    {p.origem && <Badge variant="outline" className="text-[10px]">{p.origem}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{p.descricao || p.tom}</p>
                  {sel && (
                    <div className="mt-2 flex items-center gap-3">
                      <Label className="text-[11px] text-muted-foreground w-20">Peso: {sel.peso}/10</Label>
                      <Slider value={[sel.peso]} min={1} max={10} step={1} onValueChange={(v) => setPeso(p.id, v[0])} className="flex-1" />
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}