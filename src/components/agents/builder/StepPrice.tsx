import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { BuilderState } from "@/lib/agents/promptBuilder";
import { CheckCircle2 } from "lucide-react";

const MODES = [
  { value: "evitar", label: "Evitar valores", desc: "Nunca cita preço; sempre redireciona para cotação personalizada." },
  { value: "ancorar", label: "Ancorar com faixa", desc: "Cita uma faixa ampla (ex: R$200–R$1.200) antes de qualificar." },
  { value: "transparente", label: "Transparente", desc: "Diz valores quando perguntado, sempre amarrado a benefícios." },
] as const;

export function StepPrice({ state, set }: { state: BuilderState; set: (p: Partial<BuilderState>) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Como o agent deve lidar com a pergunta sobre preço?</p>
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <Card
            key={m.value}
            onClick={() => set({ precoMode: m.value })}
            className={`p-3 cursor-pointer transition ${state.precoMode === m.value ? "border-primary bg-primary/5" : "border-border/50 hover:border-border"}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className={`h-4 w-4 ${state.precoMode === m.value ? "text-primary" : "text-muted-foreground/30"}`} />
              <span className="font-semibold text-sm">{m.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">{m.desc}</p>
          </Card>
        ))}
      </div>
      <div>
        <Label>Notas extras sobre preço (opcional)</Label>
        <Textarea
          value={state.precoNotas}
          onChange={(e) => set({ precoNotas: e.target.value })}
          rows={3}
          placeholder="ex: Se for PME com 3+ vidas, pode mencionar ‘planos a partir de R$ 280/vida’."
        />
      </div>
    </div>
  );
}