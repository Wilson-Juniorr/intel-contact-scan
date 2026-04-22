import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Save, Loader2, Brain } from "lucide-react";
import type { VendorProfile } from "@/hooks/useVendorProfiles";

const ICON_OPTIONS = ["Brain", "Headphones", "Zap", "Target", "Flame", "Sparkles", "Shield", "Crown", "Award", "Star"];
const COLOR_OPTIONS = ["#3B82F6", "#F59E0B", "#10B981", "#EC4899", "#8B5CF6", "#EF4444", "#14B8A6", "#F97316"];

type Props = {
  profile: VendorProfile | null;
  open: boolean;
  onClose: () => void;
  onSave: (payload: any) => Promise<boolean>;
};

export function VendorProfileDialog({ profile, open, onClose, onSave }: Props) {
  const [form, setForm] = useState({
    slug: "", nome: "", origem: "", descricao: "", tom: "", estilo: "",
    principios: "", quando_usar: "", evitar_quando: "",
    cor_hex: "#3B82F6", icone: "Brain", ativo: true,
    exemplos_frases: [] as string[], tags: [] as string[],
  });
  const [novaFrase, setNovaFrase] = useState("");
  const [novaTag, setNovaTag] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        slug: profile.slug, nome: profile.nome, origem: profile.origem || "",
        descricao: profile.descricao || "", tom: profile.tom || "", estilo: profile.estilo || "",
        principios: profile.principios || "", quando_usar: profile.quando_usar || "",
        evitar_quando: profile.evitar_quando || "", cor_hex: profile.cor_hex,
        icone: profile.icone, ativo: profile.ativo,
        exemplos_frases: profile.exemplos_frases, tags: profile.tags,
      });
    } else {
      setForm({
        slug: "", nome: "", origem: "", descricao: "", tom: "", estilo: "",
        principios: "", quando_usar: "", evitar_quando: "",
        cor_hex: "#3B82F6", icone: "Brain", ativo: true, exemplos_frases: [], tags: [],
      });
    }
  }, [profile, open]);

  const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const handleSave = async () => {
    if (!form.nome.trim()) return;
    const finalSlug = form.slug.trim() || slugify(form.nome);
    setSaving(true);
    const ok = await onSave({ ...(profile?.id ? { id: profile.id } : {}), ...form, slug: finalSlug });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" style={{ color: form.cor_hex }} />
            {profile ? `Editar ${profile.nome}` : "Novo Cérebro de Vendedor"}
          </DialogTitle>
          <DialogDescription>Defina como esse mestre influencia os agentes que o usam.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Chris Voss" />
            </div>
            <div>
              <Label>Slug (auto se vazio)</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="chris-voss" />
            </div>
          </div>

          <div>
            <Label>Origem / Autoridade</Label>
            <Input value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })} placeholder="Negociador FBI — autor de 'Never Split the Difference'" />
          </div>

          <div>
            <Label>Descrição curta</Label>
            <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tom</Label>
              <Input value={form.tom} onChange={(e) => setForm({ ...form, tom: e.target.value })} placeholder="calmo, curioso, cirúrgico" />
            </div>
            <div>
              <Label>Estilo</Label>
              <Input value={form.estilo} onChange={(e) => setForm({ ...form, estilo: e.target.value })} placeholder="pergunta mais do que afirma" />
            </div>
          </div>

          <div>
            <Label>Princípios-chave (entram no prompt)</Label>
            <Textarea value={form.principios} onChange={(e) => setForm({ ...form, principios: e.target.value })} rows={6} className="font-mono text-xs" placeholder="1. MIRRORING: ..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quando usar</Label>
              <Textarea value={form.quando_usar} onChange={(e) => setForm({ ...form, quando_usar: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Evitar quando</Label>
              <Textarea value={form.evitar_quando} onChange={(e) => setForm({ ...form, evitar_quando: e.target.value })} rows={2} />
            </div>
          </div>

          <div>
            <Label>Frases icônicas</Label>
            <div className="flex gap-2 mt-1">
              <Input value={novaFrase} onChange={(e) => setNovaFrase(e.target.value)} placeholder='"Parece que você tá com pressa…"' onKeyDown={(e) => { if (e.key === "Enter" && novaFrase.trim()) { e.preventDefault(); setForm({ ...form, exemplos_frases: [...form.exemplos_frases, novaFrase.trim()] }); setNovaFrase(""); } }} />
              <Button type="button" variant="outline" size="sm" onClick={() => { if (novaFrase.trim()) { setForm({ ...form, exemplos_frases: [...form.exemplos_frases, novaFrase.trim()] }); setNovaFrase(""); } }}><Plus className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {form.exemplos_frases.map((f, i) => (
                <Badge key={i} variant="secondary" className="text-[11px] gap-1">
                  {f}
                  <button onClick={() => setForm({ ...form, exemplos_frases: form.exemplos_frases.filter((_, j) => j !== i) })}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <Label>Tags</Label>
            <div className="flex gap-2 mt-1">
              <Input value={novaTag} onChange={(e) => setNovaTag(e.target.value)} placeholder="rapport, fbi" onKeyDown={(e) => { if (e.key === "Enter" && novaTag.trim()) { e.preventDefault(); setForm({ ...form, tags: [...form.tags, novaTag.trim()] }); setNovaTag(""); } }} />
              <Button type="button" variant="outline" size="sm" onClick={() => { if (novaTag.trim()) { setForm({ ...form, tags: [...form.tags, novaTag.trim()] }); setNovaTag(""); } }}><Plus className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {form.tags.map((t, i) => (
                <Badge key={i} variant="outline" className="text-[10px] gap-1">
                  {t}
                  <button onClick={() => setForm({ ...form, tags: form.tags.filter((_, j) => j !== i) })}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
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
          <Button onClick={handleSave} disabled={saving || !form.nome.trim()} className="bg-gradient-to-r from-primary to-blue-500">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Salvar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}