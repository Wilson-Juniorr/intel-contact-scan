import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Route, Clock, Filter, Activity } from "lucide-react";
import { useDistributionRules, type DistributionRule } from "@/hooks/useDistributionRules";
import { DistributionRuleDialog } from "./DistributionRuleDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function AgentsDistributionTab() {
  const { rules, logs, loading, upsert, remove, toggleActive } = useDistributionRules();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DistributionRule | null>(null);

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (r: DistributionRule) => { setEditing(r); setOpen(true); };

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><Route className="h-5 w-5 text-primary" />Regras de Distribuição</h3>
          <p className="text-sm text-muted-foreground">Configure como leads são roteados automaticamente entre agentes</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" />Nova Regra</Button>
      </div>

      <div className="grid gap-3">
        {rules.map((r) => (
          <Card key={r.id} className={`transition-all ${r.ativo ? "" : "opacity-60"}`}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">{r.nome}</CardTitle>
                    <Badge variant="outline">Prioridade {r.prioridade}</Badge>
                    <Badge variant="secondary">{r.modo_distribuicao}</Badge>
                    {r.agente_alvo && <Badge className="bg-primary/10 text-primary border-primary/20">{r.agente_alvo}</Badge>}
                  </div>
                  {r.descricao && <p className="text-sm text-muted-foreground mt-1">{r.descricao}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={r.ativo} onCheckedChange={() => toggleActive(r)} />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Remover regra?")) remove(r.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.horario_inicio.slice(0, 5)} – {r.horario_fim.slice(0, 5)}</span>
                <span className="flex items-center gap-1"><Filter className="h-3 w-3" />
                  {(r.filtro_tipo.length + r.filtro_origem.length + r.filtro_palavras_chave.length) || "sem"} filtros
                </span>
                {r.modo_distribuicao === "round_robin" && <span>{r.agentes_pool.length} agentes no pool</span>}
                <span>Fora horário: {r.fora_horario_acao}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {rules.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhuma regra configurada</p>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Últimos Roteamentos</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <div>
                  <span className="font-medium">{l.agente_escolhido || "humano"}</span>
                  <span className="text-muted-foreground"> ← {l.motivo}</span>
                </div>
                <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(l.created_at), { locale: ptBR, addSuffix: true })}</span>
              </div>
            ))}
            {logs.length === 0 && <p className="text-sm text-muted-foreground">Nenhum roteamento registrado ainda</p>}
          </div>
        </CardContent>
      </Card>

      <DistributionRuleDialog open={open} onOpenChange={setOpen} rule={editing} onSave={upsert} />
    </div>
  );
}