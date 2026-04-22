import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, MessageSquare } from "lucide-react";
import type { AgentExample, ExampleTurn } from "@/hooks/useAgentExamples";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agentSlug: string;
  example?: AgentExample | null;
  onSave: (e: Partial<AgentExample> & { agent_slug: string; scenario: string; turns: ExampleTurn[] }) => Promise<boolean>;
}

export function AgentExampleDialog({ open, onOpenChange, agentSlug, example, onSave }: Props) {
  const [scenario, setScenario] = useState("");
  const [clienteTipo, setClienteTipo] = useState<string>("PF");
  const [tomCliente, setTomCliente] = useState<string>("neutro");
  const [fonte, setFonte] = useState<string>("manual");
  const [observacao, setObservacao] = useState("");
  const [qualidadeScore, setQualidadeScore] = useState<number>(5);
  const [aprovado, setAprovado] = useState(false);
  const [tags, setTags] = useState("");
  const [turns, setTurns] = useState<ExampleTurn[]>([
    { role: "user", content: "" },
    { role: "assistant", content: "" },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (example) {
      setScenario(example.scenario);
      setClienteTipo(example.cliente_tipo || "PF");
      setTomCliente(example.tom_cliente || "neutro");
      setFonte(example.fonte || "manual");
      setObservacao(example.observacao || "");
      setQualidadeScore(example.qualidade_score || 5);
      setAprovado(example.aprovado);
      setTags((example.tags || []).join(", "));
      setTurns(example.turns?.length ? example.turns : [{ role: "user", content: "" }, { role: "assistant", content: "" }]);
    } else {
      setScenario("");
      setClienteTipo("PF");
      setTomCliente("neutro");
      setFonte("manual");
      setObservacao("");
      setQualidadeScore(5);
      setAprovado(false);
      setTags("");
      setTurns([{ role: "user", content: "" }, { role: "assistant", content: "" }]);
    }
  }, [example, open]);

  const updateTurn = (i: number, patch: Partial<ExampleTurn>) => {
    setTurns((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  };
  const addTurn = () => {
    const last = turns[turns.length - 1]?.role;
    setTurns([...turns, { role: last === "user" ? "assistant" : "user", content: "" }]);
  };
  const removeTurn = (i: number) => setTurns(turns.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!scenario.trim() || turns.some((t) => !t.content.trim())) return;
    setSaving(true);
    const ok = await onSave({
      id: example?.id,
      agent_slug: agentSlug,
      scenario: scenario.trim(),
      cliente_tipo: clienteTipo,
      tom_cliente: tomCliente,
      fonte,
      turns,
      qualidade_score: qualidadeScore,
      aprovado,
      observacao: observacao.trim() || null,
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setSaving(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            {example ? "Editar exemplo" : "Novo exemplo few-shot"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Cenário</Label>
            <Input value={scenario} onChange={(e) => setScenario(e.target.value)} placeholder="Ex: Lead PF perguntando preço sem informar idade" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Tipo de cliente</Label>
              <Select value={clienteTipo} onValueChange={setClienteTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">PF</SelectItem>
                  <SelectItem value="PJ">PJ</SelectItem>
                  <SelectItem value="PME">PME</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tom do cliente</Label>
              <Select value={tomCliente} onValueChange={setTomCliente}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="neutro">Neutro</SelectItem>
                  <SelectItem value="frio">Frio</SelectItem>
                  <SelectItem value="quente">Quente</SelectItem>
                  <SelectItem value="indeciso">Indeciso</SelectItem>
                  <SelectItem value="apressado">Apressado</SelectItem>
                  <SelectItem value="objetando">Objetando</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fonte</Label>
              <Select value={fonte} onValueChange={setFonte}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="real">Conversa real</SelectItem>
                  <SelectItem value="ideal">Caso ideal</SelectItem>
                  <SelectItem value="treinamento">Treinamento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Turnos da conversa</Label>
              <Button type="button" size="sm" variant="outline" onClick={addTurn}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar turno
              </Button>
            </div>
            {turns.map((t, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <Select value={t.role} onValueChange={(v) => updateTurn(i, { role: v as "user" | "assistant" })}>
                    <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">👤 Cliente</SelectItem>
                      <SelectItem value="assistant">🤖 Agente</SelectItem>
                    </SelectContent>
                  </Select>
                  {turns.length > 2 && (
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeTurn(i)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
                <Textarea
                  value={t.content}
                  onChange={(e) => updateTurn(i, { content: e.target.value })}
                  placeholder={t.role === "user" ? "Mensagem do cliente..." : "Resposta ideal do agente..."}
                  rows={3}
                />
                <Input
                  value={t.nota || ""}
                  onChange={(e) => updateTurn(i, { nota: e.target.value })}
                  placeholder="Nota opcional (ex: técnica usada, gatilho aplicado)"
                  className="text-xs"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Qualidade (1-10)</Label>
              <Input type="number" min={1} max={10} value={qualidadeScore} onChange={(e) => setQualidadeScore(Number(e.target.value))} />
            </div>
            <div>
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="objeção, preço, urgência" />
            </div>
          </div>

          <div>
            <Label>Observação</Label>
            <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Por que este exemplo é importante?" rows={2} />
          </div>

          <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/30">
            <div>
              <p className="text-sm font-medium">Aprovado para uso em prompt</p>
              <p className="text-xs text-muted-foreground">Apenas exemplos aprovados são injetados no contexto do agente</p>
            </div>
            <Switch checked={aprovado} onCheckedChange={setAprovado} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !scenario.trim()}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
