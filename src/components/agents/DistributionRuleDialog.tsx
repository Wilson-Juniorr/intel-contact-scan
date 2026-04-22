import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { DistributionRule } from "@/hooks/useDistributionRules";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rule: DistributionRule | null;
  onSave: (payload: any) => Promise<boolean>;
};

const DIAS = [
  { v: 0, l: "Dom" }, { v: 1, l: "Seg" }, { v: 2, l: "Ter" }, { v: 3, l: "Qua" },
  { v: 4, l: "Qui" }, { v: 5, l: "Sex" }, { v: 6, l: "Sáb" },
];

export function DistributionRuleDialog({ open, onOpenChange, rule, onSave }: Props) {
  const [agents, setAgents] = useState<{ slug: string; nome: string }[]>([]);
  const [form, setForm] = useState<any>({});
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    if (open) {
      supabase.from("agents_config").select("slug,nome").eq("ativo", true).then(({ data }) => setAgents((data as any) || []));
      setForm(rule || {
        nome: "", descricao: "", prioridade: 10, ativo: true,
        filtro_tipo: [], filtro_origem: [], filtro_estagio: [], filtro_palavras_chave: [],
        agente_alvo: null, agentes_pool: [], modo_distribuicao: "fixo",
        horario_inicio: "08:00", horario_fim: "20:00", dias_semana: [1, 2, 3, 4, 5],
        fora_horario_acao: "agendar", max_leads_dia: null,
      });
    }
  }, [open, rule]);

  const toggleArr = (key: string, v: any) => {
    const arr = form[key] || [];
    setForm({ ...form, [key]: arr.includes(v) ? arr.filter((x: any) => x !== v) : [...arr, v] });
  };

  const submit = async () => {
    if (!form.nome) return;
    const payload = { ...form, horario_inicio: form.horario_inicio + (form.horario_inicio.length === 5 ? ":00" : ""), horario_fim: form.horario_fim + (form.horario_fim.length === 5 ? ":00" : "") };
    const ok = await onSave(payload);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{rule ? "Editar Regra" : "Nova Regra de Distribuição"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nome</Label><Input value={form.nome || ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Prioridade (maior = primeiro)</Label><Input type="number" value={form.prioridade ?? 10} onChange={(e) => setForm({ ...form, prioridade: +e.target.value })} /></div>
          </div>
          <div><Label>Descrição</Label><Textarea value={form.descricao || ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>

          <div className="border rounded-lg p-3 space-y-3">
            <h4 className="font-semibold text-sm">Filtros (combinação E)</h4>
            <div>
              <Label className="text-xs">Tipo de Lead</Label>
              <div className="flex gap-2 mt-1">
                {["PF", "PJ", "PME"].map((t) => (
                  <Badge key={t} variant={form.filtro_tipo?.includes(t) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleArr("filtro_tipo", t)}>{t}</Badge>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Origem</Label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {["whatsapp", "manual", "importacao", "ocr"].map((t) => (
                  <Badge key={t} variant={form.filtro_origem?.includes(t) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleArr("filtro_origem", t)}>{t}</Badge>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Palavras-chave na 1ª mensagem</Label>
              <div className="flex gap-2 mt-1">
                <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="ex: cotação" onKeyDown={(e) => { if (e.key === "Enter" && keyword) { toggleArr("filtro_palavras_chave", keyword); setKeyword(""); } }} />
                <Button type="button" variant="outline" size="sm" onClick={() => { if (keyword) { toggleArr("filtro_palavras_chave", keyword); setKeyword(""); } }}>Add</Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {(form.filtro_palavras_chave || []).map((k: string) => (
                  <Badge key={k} variant="secondary" className="gap-1">{k}<X className="h-3 w-3 cursor-pointer" onClick={() => toggleArr("filtro_palavras_chave", k)} /></Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-3 space-y-3">
            <h4 className="font-semibold text-sm">Destino</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Modo</Label>
                <Select value={form.modo_distribuicao} onValueChange={(v) => setForm({ ...form, modo_distribuicao: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixo">Fixo (um agente)</SelectItem>
                    <SelectItem value="round_robin">Round-Robin (pool)</SelectItem>
                    <SelectItem value="menos_carga">Menos carga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Agente Alvo (modo fixo)</Label>
                <Select value={form.agente_alvo || "_humano"} onValueChange={(v) => setForm({ ...form, agente_alvo: v === "_humano" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_humano">Humano (sem agent)</SelectItem>
                    {agents.map((a) => <SelectItem key={a.slug} value={a.slug}>{a.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.modo_distribuicao === "round_robin" && (
              <div>
                <Label className="text-xs">Pool de Agentes</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {agents.map((a) => (
                    <Badge key={a.slug} variant={form.agentes_pool?.includes(a.slug) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleArr("agentes_pool", a.slug)}>{a.nome}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border rounded-lg p-3 space-y-3">
            <h4 className="font-semibold text-sm">Janela de Funcionamento</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Início</Label><Input type="time" value={(form.horario_inicio || "").slice(0, 5)} onChange={(e) => setForm({ ...form, horario_inicio: e.target.value })} /></div>
              <div><Label className="text-xs">Fim</Label><Input type="time" value={(form.horario_fim || "").slice(0, 5)} onChange={(e) => setForm({ ...form, horario_fim: e.target.value })} /></div>
            </div>
            <div>
              <Label className="text-xs">Dias da Semana</Label>
              <div className="flex gap-1 mt-1">
                {DIAS.map((d) => (
                  <Badge key={d.v} variant={form.dias_semana?.includes(d.v) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleArr("dias_semana", d.v)}>{d.l}</Badge>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Fora do horário</Label>
              <Select value={form.fora_horario_acao} onValueChange={(v) => setForm({ ...form, fora_horario_acao: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendar">Agendar para horário</SelectItem>
                  <SelectItem value="humano">Encaminhar para humano</SelectItem>
                  <SelectItem value="ignorar">Ignorar regra</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Switch checked={form.ativo ?? true} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /><Label>Regra Ativa</Label></div>
            <div><Label className="text-xs mr-2">Limite leads/dia</Label><Input className="inline-block w-24" type="number" value={form.max_leads_dia || ""} onChange={(e) => setForm({ ...form, max_leads_dia: e.target.value ? +e.target.value : null })} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}