import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BuilderState } from "@/lib/agents/promptBuilder";
import { Plus, X } from "lucide-react";
import { useState } from "react";

const SUGESTOES = ["tipo (PF/PJ/PME)", "vidas (titular + dependentes)", "faixa etária", "plano atual / operadora", "rede preferida (médico ou hospital)", "região / cidade", "orçamento aproximado", "urgência da contratação"];

export function StepFlow({ state, set }: { state: BuilderState; set: (p: Partial<BuilderState>) => void }) {
  const [input, setInput] = useState("");

  const add = (v: string) => {
    const val = v.trim();
    if (!val || state.fluxoCampos.includes(val)) return;
    set({ fluxoCampos: [...state.fluxoCampos, val] });
    setInput("");
  };
  const remove = (v: string) => set({ fluxoCampos: state.fluxoCampos.filter((x) => x !== v) });

  const restantes = SUGESTOES.filter((s) => !state.fluxoCampos.includes(s));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Quais informações o agent precisa coletar do cliente nesta conversa? Use itens curtos e claros.
      </p>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add(input))}
          placeholder="ex: cidade onde mora"
        />
        <Button onClick={() => add(input)} variant="outline"><Plus className="h-4 w-4" /></Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {state.fluxoCampos.map((c) => (
          <Badge key={c} variant="secondary" className="text-xs gap-1 py-1">
            {c}
            <button onClick={() => remove(c)} className="ml-1 hover:text-destructive"><X className="h-3 w-3" /></button>
          </Badge>
        ))}
      </div>

      {restantes.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Sugestões:</p>
          <div className="flex flex-wrap gap-2">
            {restantes.map((s) => (
              <button
                key={s}
                onClick={() => add(s)}
                className="text-xs px-2 py-1 rounded-md border border-dashed border-border hover:border-primary hover:bg-primary/5 transition"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}