import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuilderState, slugify } from "@/lib/agents/promptBuilder";

export function StepIdentity({ state, set }: { state: BuilderState; set: (p: Partial<BuilderState>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Nome do agent</Label>
        <Input
          value={state.nome}
          onChange={(e) => set({ nome: e.target.value, slug: state.slug || slugify(e.target.value) })}
          placeholder="ex: Camila SDR"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Slug (id técnico)</Label>
          <Input value={state.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} placeholder="camila-sdr" />
        </div>
        <div>
          <Label>Tipo</Label>
          <Select value={state.tipo} onValueChange={(v: any) => set({ tipo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="front_line">Front-line (fala com cliente)</SelectItem>
              <SelectItem value="meta">Meta (orquestra outros)</SelectItem>
              <SelectItem value="junior">Júnior (assistente)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Descrição curta</Label>
        <Input value={state.descricao} onChange={(e) => set({ descricao: e.target.value })} placeholder="SDR Qualificador WhatsApp" />
      </div>
      <div>
        <Label>Persona em uma frase</Label>
        <Textarea
          value={state.persona_resumo}
          onChange={(e) => set({ persona_resumo: e.target.value })}
          rows={3}
          placeholder="Você é uma SDR consultiva, calorosa e objetiva. Trata o cliente como gente, nunca como ticket."
        />
      </div>
    </div>
  );
}