import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BuilderState } from "@/lib/agents/promptBuilder";
import { Plus, Trash2 } from "lucide-react";

const SUGESTOES = [
  { gatilho: "Tá caro", resposta: "Entendo. Posso te mostrar planos a partir de R$X que mantêm o que mais importa pra você?" },
  { gatilho: "Vou pensar", resposta: "Claro. Pra eu te ajudar a pensar com base certa: o que mais te trava agora — preço, rede ou cobertura?" },
  { gatilho: "Já tenho plano", resposta: "Show. Posso fazer um comparativo rápido pra você ver se vale a pena trocar — sem compromisso?" },
];

export function StepObjections({ state, set }: { state: BuilderState; set: (p: Partial<BuilderState>) => void }) {
  const add = (o: { gatilho: string; resposta: string } = { gatilho: "", resposta: "" }) =>
    set({ objections: [...state.objections, o] });
  const update = (i: number, patch: Partial<{ gatilho: string; resposta: string }>) =>
    set({ objections: state.objections.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
  const remove = (i: number) => set({ objections: state.objections.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Liste as objeções que aparecem com mais frequência e como você quer que o agent responda.
      </p>

      {state.objections.length === 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Sugestões rápidas:</Label>
          {SUGESTOES.map((s, i) => (
            <Button key={i} variant="outline" size="sm" className="mr-2" onClick={() => add(s)}>
              + "{s.gatilho}"
            </Button>
          ))}
        </div>
      )}

      <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
        {state.objections.map((o, i) => (
          <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/20">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <Input value={o.gatilho} onChange={(e) => update(i, { gatilho: e.target.value })} placeholder='Cliente diz: "tá caro"' />
                <Textarea value={o.resposta} onChange={(e) => update(i, { resposta: e.target.value })} rows={2} placeholder="Como o agent responde…" />
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(i)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={() => add()}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar objeção</Button>
    </div>
  );
}