import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Save, Loader2, Sparkles, Trash2, Plus } from "lucide-react";
import type { SalesTechnique, TechniqueExample } from "@/hooks/useSalesTechniques";
import { TECHNIQUE_CATEGORIES } from "@/hooks/useSalesTechniques";

const COLOR_OPTIONS = ["#3B82F6", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#EF4444", "#14B8A6", "#F97316"];
const ICON_OPTIONS = ["Sparkles", "MessageCircle", "Heart", "RefreshCw", "AlertTriangle", "CheckCircle2", "GitBranch", "HelpCircle", "Clock", "Target", "Zap"];

type Props = {
  technique: SalesTechnique | null;
  open: boolean;
  onClose: () => void;
  onSave: (payload: any) => Promise<boolean>;
};

export function SalesTechniqueDialog({ technique, open, onClose, onSave }: Props) {
  const [form, setForm] = useState({
    slug: "", nome: "", categoria: "rapport", descricao: "",
    como_aplicar: "", gatilho_uso: "", fonte_autor: "",
    nivel_dificuldade: 2, cor_hex: "#3B82F6", icone: "Sparkles", ativo: true,
    exemplos: [] as TechniqueExample[],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (technique) {
      setForm({
        slug: technique.slug, nome: technique.nome, categoria: technique.categoria,
        descricao: technique.descricao || "", como_aplicar: technique.como_aplicar,
        gatilho_uso: technique.gatilho_uso || "", fonte_autor: technique.fonte_autor || "",
        nivel_dificuldade: technique.nivel_dificuldade, cor_hex: technique.cor_hex,
        icone: technique.icone, ativo: technique.ativo, exemplos: technique.exemplos,
      });
    } else {
      setForm({
        slug: "", nome: "", categoria: "rapport", descricao: "",
        como_aplicar: "", gatilho_uso: "", fonte_autor: "",
        nivel_dificuldade: 2, cor_hex: "#3B82F6", icone: "Sparkles", ativo: true, exemplos: [],
      });
    }
  }, [technique, open]);

  const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const handleSave = async () => {
    if (!form.nome.trim() || !form.como_aplicar.trim()) return;
    const finalSlug = form.slug.trim() || slugify(form.nome);
    setSaving(true);
    const ok = await onSave({ ...(technique?.id ? { id: technique.id } : {}), ...form, slug: finalSlug });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: form.cor_hex }} />
            {technique ? `Editar ${technique.nome}` : "Nova Técnica de Venda"}
          </DialogTitle>
          <DialogDescription>Técnica reutilizável que pode ser anexada a qualquer agente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Mirroring (Espelhamento)" />
            </div>
            <div>
              <Label>Slug (auto se vazio)</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="mirroring" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TECHNIQUE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Autor / Fonte</Label>
              <Input value={form.fonte_autor} onChange={(e) => setForm({ ...form, fonte_autor: e.target.value })} placeholder="Chris Voss" />
            </div>
            <div>
              <Label>Dificuldade (1-5)</Label>
              <Input type="number" min={1} max={5} value={form.nivel_dificuldade} onChange={(e) => setForm({ ...form, nivel_dificuldade: parseInt(e.target.value) || 2 })} />
            </div>
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} />
          </div>

          <div>
            <Label>Como aplicar (entra no prompt) *</Label>
            <Textarea value={form.como_aplicar} onChange={(e) => setForm({ ...form, como_aplicar: e.target.value })} rows={4} className="font-mono text-xs" />
          </div>

          <div>
            <Label>Gatilho de uso (quando aplicar)</Label>
            <Input value={form.gatilho_uso} onChange={(e) => setForm({ ...form, gatilho_uso: e.target.value })} placeholder="Cliente disse algo vago ou emocional" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Exemplos</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, exemplos: [...form.exemplos, { situacao: "", cliente: "", agente: "" }] })}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
              </Button>
            </div>
            <div className="space-y-2">
              {form.exemplos.map((ex, i) => (
                <Card key={i} className="p-3 space-y-2 bg-muted/30">
                  <div className="flex justify-between items-start gap-2">
                    <Input value={ex.situacao} onChange={(e) => { const arr = [...form.exemplos]; arr[i] = { ...ex, situacao: e.target.value }; setForm({ ...form, exemplos: arr }); }} placeholder="Situação" className="text-xs" />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, exemplos: form.exemplos.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                  </div>
                  <Textarea value={ex.cliente} onChange={(e) => { const arr = [...form.exemplos]; arr[i] = { ...ex, cliente: e.target.value }; setForm({ ...form, exemplos: arr }); }} placeholder="Cliente diz…" rows={2} className="text-xs" />
                  <Textarea value={ex.agente} onChange={(e) => { const arr = [...form.exemplos]; arr[i] = { ...ex, agente: e.target.value }; setForm({ ...form, exemplos: arr }); }} placeholder="Agente responde…" rows={2} className="text-xs" />
                </Card>
              ))}
              {form.exemplos.length === 0 && <p className="text-xs text-muted-foreground italic">Adicione exemplos pra IA aprender pelo demonstração.</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {COLOR_OPTIONS.map((c) => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, cor_hex: c })} className="h-7 w-7 rounded-md border-2 transition-all" style={{ backgroundColor: c, borderColor: form.cor_hex === c ? "hsl(var(--foreground))" : "transparent" }} />
                ))}
              </div>
            </div>
            <div>
              <Label>Ícone</Label>
              <select value={form.icone} onChange={(e) => setForm({ ...form, icone: e.target.value })} className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !form.nome.trim() || !form.como_aplicar.trim()} className="bg-gradient-to-r from-primary to-blue-500">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Salvar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}