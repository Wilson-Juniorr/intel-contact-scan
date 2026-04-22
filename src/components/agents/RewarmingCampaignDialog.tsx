import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import type { RewarmingCampaign } from "@/hooks/useRewarming";
import { supabase } from "@/integrations/supabase/client";

const ESTAGIOS = ["novo", "qualificacao", "cotacao_enviada", "negociacao", "sem_retorno", "perdido"];
const DIAS = [{ v: 0, l: "D" }, { v: 1, l: "S" }, { v: 2, l: "T" }, { v: 3, l: "Q" }, { v: 4, l: "Q" }, { v: 5, l: "S" }, { v: 6, l: "S" }];

export function RewarmingCampaignDialog({ open, onOpenChange, campaign, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  campaign: RewarmingCampaign | null; onSave: (p: any) => Promise<boolean>;
}) {
  const [agents, setAgents] = useState<{ slug: string; nome: string }[]>([]);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (open) {
      supabase.from("agents_config").select("slug,nome").eq("ativo", true).then(({ data }) => setAgents((data as any) || []));
      setForm(campaign || {
        nome: "", descricao: "", ativo: true, agente_slug: "camila-sdr",
        dias_inativo_min: 14, estagios_alvo: ["cotacao_enviada", "qualificacao"],
        excluir_perdidos: true, filtro_tipo: [],
        max_tentativas: 3, intervalo_dias: 7, horario_envio: "10:00",
        dias_semana: [1, 2, 3, 4, 5],
        mensagens_template: ["Oi {{nome}}, ainda faz sentido conversarmos?"],
        tom: "consultivo", objetivo: "reabrir_conversa",
      });
    }
  }, [open, campaign]);

  const toggleArr = (key: string, v: any) => {
    const arr = form[key] || [];
    setForm({ ...form, [key]: arr.includes(v) ? arr.filter((x: any) => x !== v) : [...arr, v] });
  };

  const updateMsg = (i: number, v: string) => {
    const arr = [...(form.mensagens_template || [])];
    arr[i] = v;
    setForm({ ...form, mensagens_template: arr });
  };

  const addMsg = () => setForm({ ...form, mensagens_template: [...(form.mensagens_template || []), ""] });
  const removeMsg = (i: number) => setForm({ ...form, mensagens_template: form.mensagens_template.filter((_: any, idx: number) => idx !== i) });

  const submit = async () => {
    if (!form.nome || !form.agente_slug) return;
    const payload = { ...form, horario_envio: form.horario_envio.length === 5 ? form.horario_envio + ":00" : form.horario_envio };
    const ok = await onSave(payload);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{campaign ? "Editar Campanha" : "Nova Campanha de Reaquecimento"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nome</Label><Input value={form.nome || ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div>
              <Label>Agente Responsável</Label>
              <Select value={form.agente_slug} onValueChange={(v) => setForm({ ...form, agente_slug: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{agents.map((a) => <SelectItem key={a.slug} value={a.slug}>{a.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Descrição</Label><Textarea value={form.descricao || ""} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>

          <div className="border rounded-lg p-3 space-y-3">
            <h4 className="font-semibold text-sm">Quais leads enrolar</h4>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Inativos há (dias)</Label><Input type="number" value={form.dias_inativo_min ?? 14} onChange={(e) => setForm({ ...form, dias_inativo_min: +e.target.value })} /></div>
              <div className="flex items-center gap-2 mt-6"><Switch checked={form.excluir_perdidos} onCheckedChange={(v) => setForm({ ...form, excluir_perdidos: v })} /><Label>Excluir perdidos</Label></div>
            </div>
            <div>
              <Label className="text-xs">Estágios alvo</Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {ESTAGIOS.map((e) => (
                  <Badge key={e} variant={form.estagios_alvo?.includes(e) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleArr("estagios_alvo", e)}>{e}</Badge>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Tipos (vazio = todos)</Label>
              <div className="flex gap-2 mt-1">
                {["PF", "PJ", "PME"].map((t) => (
                  <Badge key={t} variant={form.filtro_tipo?.includes(t) ? "default" : "outline"} className="cursor-pointer" onClick={() => toggleArr("filtro_tipo", t)}>{t}</Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-3 space-y-3">
            <h4 className="font-semibold text-sm">Cadência</h4>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Máx. tentativas</Label><Input type="number" value={form.max_tentativas ?? 3} onChange={(e) => setForm({ ...form, max_tentativas: +e.target.value })} /></div>
              <div><Label className="text-xs">Intervalo (dias)</Label><Input type="number" value={form.intervalo_dias ?? 7} onChange={(e) => setForm({ ...form, intervalo_dias: +e.target.value })} /></div>
              <div><Label className="text-xs">Horário envio</Label><Input type="time" value={(form.horario_envio || "").slice(0, 5)} onChange={(e) => setForm({ ...form, horario_envio: e.target.value })} /></div>
            </div>
            <div>
              <Label className="text-xs">Dias da semana</Label>
              <div className="flex gap-1 mt-1">
                {DIAS.map((d, i) => (
                  <Badge key={i} variant={form.dias_semana?.includes(d.v) ? "default" : "outline"} className="cursor-pointer w-8 justify-center" onClick={() => toggleArr("dias_semana", d.v)}>{d.l}</Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">Mensagens (use {`{{nome}}`} para personalizar)</h4>
              <Button variant="outline" size="sm" onClick={addMsg}><Plus className="h-3 w-3 mr-1" />Toque</Button>
            </div>
            {form.mensagens_template?.map((m: string, i: number) => (
              <div key={i} className="flex gap-2">
                <span className="text-xs text-muted-foreground mt-2 w-12">Toque {i + 1}</span>
                <Textarea value={m} onChange={(e) => updateMsg(i, e.target.value)} rows={2} />
                <Button variant="ghost" size="icon" onClick={() => removeMsg(i)}><X className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2"><Switch checked={form.ativo ?? true} onCheckedChange={(v) => setForm({ ...form, ativo: v })} /><Label>Campanha Ativa</Label></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}