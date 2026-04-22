import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BuilderState } from "@/lib/agents/promptBuilder";
import { Plus, X } from "lucide-react";
import { useState } from "react";

const MODELOS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (rápido, padrão)" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (econômico)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "openai/gpt-5", label: "GPT-5" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
];

export function StepRules({ state, set }: { state: BuilderState; set: (p: Partial<BuilderState>) => void }) {
  const [block, setBlock] = useState("");
  const [rule, setRule] = useState("");

  const addBlock = () => {
    if (!block.trim()) return;
    set({ blocklist: [...state.blocklist, block.trim()] });
    setBlock("");
  };
  const addRule = () => {
    if (!rule.trim()) return;
    set({ regrasDuras: [...state.regrasDuras, rule.trim()] });
    setRule("");
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Regras duras (o agent jamais pode quebrar)</Label>
        <div className="flex gap-2 mt-1">
          <Input value={rule} onChange={(e) => setRule(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRule())} placeholder="ex: nunca prometer aprovação imediata" />
          <Button variant="outline" onClick={addRule}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="mt-2 space-y-1">
          {state.regrasDuras.map((r, i) => (
            <div key={i} className="text-xs flex items-center justify-between bg-destructive/5 border border-destructive/20 rounded px-2 py-1">
              <span>{r}</span>
              <button onClick={() => set({ regrasDuras: state.regrasDuras.filter((_, idx) => idx !== i) })}>
                <X className="h-3 w-3 text-destructive" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>Palavras proibidas (blocklist)</Label>
        <div className="flex gap-2 mt-1">
          <Input value={block} onChange={(e) => setBlock(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBlock())} placeholder="ex: garantido" />
          <Button variant="outline" onClick={addBlock}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {state.blocklist.map((b) => (
            <Badge key={b} variant="outline" className="text-xs gap-1 border-destructive/30 text-destructive">
              {b}
              <button onClick={() => set({ blocklist: state.blocklist.filter((x) => x !== b) })}><X className="h-3 w-3" /></button>
            </Badge>
          ))}
        </div>
      </div>

      <div className="border-t pt-4 space-y-3">
        <Label className="text-xs uppercase text-muted-foreground">Configuração técnica</Label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Modelo</Label>
            <Select value={state.modelo} onValueChange={(v) => set({ modelo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODELOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Max tokens</Label>
            <Input type="number" value={state.max_tokens} onChange={(e) => set({ max_tokens: parseInt(e.target.value) || 0 })} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Temperature: {state.temperature}</Label>
          <Slider value={[state.temperature]} min={0} max={1.5} step={0.1} onValueChange={(v) => set({ temperature: v[0] })} />
        </div>
      </div>
    </div>
  );
}