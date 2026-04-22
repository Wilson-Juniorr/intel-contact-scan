import { useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useVendorProfiles } from "@/hooks/useVendorProfiles";
import { useSalesTechniques } from "@/hooks/useSalesTechniques";
import { BuilderState, generateSystemPrompt } from "@/lib/agents/promptBuilder";

export function StepReview({ state }: { state: BuilderState }) {
  const { profiles } = useVendorProfiles();
  const { techniques } = useSalesTechniques();

  const prompt = useMemo(() => generateSystemPrompt(state, profiles, techniques), [state, profiles, techniques]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Card className="p-2"><span className="text-muted-foreground">Cérebros</span><div className="font-bold text-lg">{state.brains.length}</div></Card>
        <Card className="p-2"><span className="text-muted-foreground">Técnicas</span><div className="font-bold text-lg">{state.techniques.length}</div></Card>
        <Card className="p-2"><span className="text-muted-foreground">Objeções</span><div className="font-bold text-lg">{state.objections.length}</div></Card>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline" className="text-[10px]">{state.modelo}</Badge>
        <Badge variant="outline" className="text-[10px]">temp {state.temperature}</Badge>
        <Badge variant="outline" className="text-[10px]">{state.max_tokens} tokens</Badge>
        <Badge variant="outline" className="text-[10px]">preço: {state.precoMode}</Badge>
        <Badge variant="outline" className="text-[10px]">{state.fluxoCampos.length} campos a coletar</Badge>
      </div>
      <div>
        <Label>System prompt gerado (revise antes de salvar)</Label>
        <Textarea value={prompt} readOnly rows={20} className="font-mono text-[11px]" />
      </div>
    </div>
  );
}