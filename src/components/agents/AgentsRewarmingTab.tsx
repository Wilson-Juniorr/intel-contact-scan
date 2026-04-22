import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Snowflake, Flame, Play, UserPlus, Users } from "lucide-react";
import { useRewarming, type RewarmingCampaign } from "@/hooks/useRewarming";
import { RewarmingCampaignDialog } from "./RewarmingCampaignDialog";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function AgentsRewarmingTab() {
  const { campaigns, pool, loading, upsertCampaign, removeCampaign, toggleCampaign, enrollLeads, runNow, removeFromPool } = useRewarming();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RewarmingCampaign | null>(null);

  if (loading) return <div className="space-y-3">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;

  const ativos = pool.filter((p) => p.status === "ativo").length;
  const responderam = pool.filter((p) => p.status === "respondeu").length;
  const concluidos = pool.filter((p) => p.status === "concluido").length;
  const taxaResposta = pool.length ? Math.round((responderam / pool.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><Snowflake className="h-5 w-5 text-blue-500" />Reaquecimento de Leads Frios</h3>
          <p className="text-sm text-muted-foreground">Reabra conversas com leads parados automaticamente</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runNow}><Play className="h-4 w-4 mr-2" />Executar agora</Button>
          <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />Nova Campanha</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">No pool</div><div className="text-2xl font-bold">{pool.length}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Ativos</div><div className="text-2xl font-bold text-blue-500">{ativos}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Responderam</div><div className="text-2xl font-bold text-green-500">{responderam}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">Taxa de resposta</div><div className="text-2xl font-bold flex items-center gap-1"><Flame className="h-5 w-5 text-orange-500" />{taxaResposta}%</div></CardContent></Card>
      </div>

      <div className="grid gap-3">
        {campaigns.map((c) => (
          <Card key={c.id} className={c.ativo ? "" : "opacity-60"}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">{c.nome}</CardTitle>
                    <Badge variant="outline">{c.agente_slug}</Badge>
                    <Badge variant="secondary">{c.dias_inativo_min}d inativo</Badge>
                    <Badge variant="secondary">{c.max_tentativas} toques</Badge>
                    <Badge variant="secondary">a cada {c.intervalo_dias}d</Badge>
                  </div>
                  {c.descricao && <p className="text-sm text-muted-foreground mt-1">{c.descricao}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={c.ativo} onCheckedChange={() => toggleCampaign(c)} />
                  <Button variant="outline" size="sm" onClick={() => enrollLeads(c.id)}><UserPlus className="h-3 w-3 mr-1" />Enrolar</Button>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Remover campanha?")) removeCampaign(c.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
        {campaigns.length === 0 && <p className="text-center text-muted-foreground py-8">Nenhuma campanha configurada</p>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Pool ({pool.length} leads)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {pool.slice(0, 50).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                <div className="flex-1">
                  <div className="font-medium">{p.lead_nome || p.lead_phone}</div>
                  <div className="text-xs text-muted-foreground">{p.campaign_nome} • Tentativa {p.tentativas_feitas}/{campaigns.find((c) => c.id === p.campaign_id)?.max_tentativas || 3}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={p.status === "respondeu" ? "default" : p.status === "ativo" ? "secondary" : "outline"} className={p.status === "respondeu" ? "bg-green-500/10 text-green-600 border-green-500/30" : ""}>{p.status}</Badge>
                  <span className="text-xs text-muted-foreground w-24 text-right">{p.status === "ativo" ? `próx ${formatDistanceToNow(new Date(p.proxima_execucao), { locale: ptBR, addSuffix: true })}` : ""}</span>
                  {p.status === "ativo" && <Button variant="ghost" size="icon" onClick={() => removeFromPool(p.id)}><Trash2 className="h-3 w-3" /></Button>}
                </div>
              </div>
            ))}
            {pool.length === 0 && <p className="text-sm text-muted-foreground">Pool vazio. Crie uma campanha e clique em "Enrolar".</p>}
          </div>
        </CardContent>
      </Card>

      <RewarmingCampaignDialog open={open} onOpenChange={setOpen} campaign={editing} onSave={upsertCampaign} />
    </div>
  );
}