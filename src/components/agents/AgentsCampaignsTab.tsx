import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Megaphone, Loader2, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

type Campaign = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  agent_slug: string;
  utm_codes: string[];
  trigger_phrases: string[];
  fuzzy_threshold: number;
  preset_context: Record<string, unknown>;
  skip_questions: string[];
  opening_message: string | null;
  detection_count: number;
  qualified_count: number;
};

const EMPTY: Omit<Campaign, "id" | "detection_count" | "qualified_count"> = {
  nome: "",
  descricao: "",
  ativo: true,
  agent_slug: "sdr-qualificador",
  utm_codes: [],
  trigger_phrases: [],
  fuzzy_threshold: 0.7,
  preset_context: {},
  skip_questions: [],
  opening_message: "",
};

export function AgentsCampaignsTab() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<typeof EMPTY>(EMPTY);
  const [presetText, setPresetText] = useState("{}");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("campaign_triggers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Campaign[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function startEdit(c: Campaign | null) {
    if (c) {
      setEditing(c);
      setDraft({
        nome: c.nome, descricao: c.descricao ?? "", ativo: c.ativo, agent_slug: c.agent_slug,
        utm_codes: c.utm_codes ?? [], trigger_phrases: c.trigger_phrases ?? [],
        fuzzy_threshold: c.fuzzy_threshold, preset_context: c.preset_context ?? {},
        skip_questions: c.skip_questions ?? [], opening_message: c.opening_message ?? "",
      });
      setPresetText(JSON.stringify(c.preset_context ?? {}, null, 2));
    } else {
      setEditing(null); setDraft(EMPTY); setPresetText("{}");
    }
    setOpen(true);
  }

  async function save() {
    let parsedPreset: Record<string, unknown> = {};
    try { parsedPreset = JSON.parse(presetText || "{}"); }
    catch { toast.error("Preset Context não é JSON válido"); return; }
    const payload = { ...draft, preset_context: parsedPreset as any };
    const { error } = editing
      ? await supabase.from("campaign_triggers").update(payload as any).eq("id", editing.id)
      : await supabase.from("campaign_triggers").insert(payload as any);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Campanha atualizada" : "Campanha criada");
    setOpen(false); load();
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta campanha?")) return;
    const { error } = await supabase.from("campaign_triggers").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Excluída"); load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" /> Campanhas de tráfego
          </h2>
          <p className="text-xs text-muted-foreground">
            Gatilhos por UTM ou frase. Quando o lead chega com o sinal, o SDR já entra com contexto e pula perguntas.
          </p>
        </div>
        <Button size="sm" onClick={() => startEdit(null)}><Plus className="h-4 w-4 mr-1" /> Nova campanha</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma campanha cadastrada. Crie a primeira pra começar a rastrear leads de tráfego pago.
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {items.map((c) => (
            <Card key={c.id} className="border-border/50">
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm truncate">{c.nome}</span>
                    {c.ativo ? <Badge variant="default" className="text-[10px]">ativo</Badge> : <Badge variant="outline" className="text-[10px]">pausado</Badge>}
                    <Badge variant="outline" className="text-[10px] font-mono">{c.agent_slug}</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
                    <span>UTMs: {c.utm_codes.length}</span>
                    <span>Frases: {c.trigger_phrases.length}</span>
                    <span>Detectada: {c.detection_count}x</span>
                    <span>Qualificou: {c.qualified_count}x</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar campanha" : "Nova campanha"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input value={draft.nome} onChange={(e) => setDraft({ ...draft, nome: e.target.value })} placeholder="Ex: Família Dezembro 25" />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">Agent</Label>
                  <Input value={draft.agent_slug} onChange={(e) => setDraft({ ...draft, agent_slug: e.target.value })} />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <Switch checked={draft.ativo} onCheckedChange={(v) => setDraft({ ...draft, ativo: v })} />
                  <span className="text-xs">Ativo</span>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs">Descrição</Label>
              <Input value={draft.descricao ?? ""} onChange={(e) => setDraft({ ...draft, descricao: e.target.value })} />
            </div>

            <div>
              <Label className="text-xs">Códigos UTM (separados por vírgula)</Label>
              <Input
                value={draft.utm_codes.join(", ")}
                onChange={(e) => setDraft({ ...draft, utm_codes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="meta_familia_dez25, gads_pme_jan26"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Bate com utm_campaign/utm_source da query do wa.me ou do texto</p>
            </div>

            <div>
              <Label className="text-xs">Frases-gatilho (uma por linha)</Label>
              <Textarea
                rows={4}
                value={draft.trigger_phrases.join("\n")}
                onChange={(e) => setDraft({ ...draft, trigger_phrases: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                placeholder={"quero saber do plano família\nplano para minha família\ncotação plano familiar"}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Limite fuzzy (0.5–1.0)</Label>
                <Input
                  type="number" step="0.05" min={0.5} max={1}
                  value={draft.fuzzy_threshold}
                  onChange={(e) => setDraft({ ...draft, fuzzy_threshold: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label className="text-xs">Perguntas a pular (separadas por vírgula)</Label>
                <Input
                  value={draft.skip_questions.join(", ")}
                  onChange={(e) => setDraft({ ...draft, skip_questions: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="tipo, o_que_busca"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Preset Context (JSON)</Label>
              <Textarea
                rows={5}
                className="font-mono text-xs"
                value={presetText}
                onChange={(e) => setPresetText(e.target.value)}
                placeholder={'{\n  "tipo": "PF",\n  "o_que_busca": "plano para família"\n}'}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Vai pré-preencher o que o SDR já sabe sobre o lead</p>
            </div>

            <div>
              <Label className="text-xs">Mensagem de abertura (opcional)</Label>
              <Textarea
                rows={2}
                value={draft.opening_message ?? ""}
                onChange={(e) => setDraft({ ...draft, opening_message: e.target.value })}
                placeholder="Oi! Vi que veio pelo nosso anúncio do plano família — me conta..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}