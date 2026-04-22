import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2, CheckCircle2, Circle, Star, Sparkles, MessageSquare } from "lucide-react";
import { useAgentExamples, type AgentExample } from "@/hooks/useAgentExamples";
import { AgentExampleDialog } from "./AgentExampleDialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export function AgentsExamplesTab() {
  const [agents, setAgents] = useState<{ slug: string; nome: string; ativo: boolean }[]>([]);
  const [agentSlug, setAgentSlug] = useState<string>("sdr-qualificador");
  const { examples, loading, upsert, remove, toggleApproval } = useAgentExamples(agentSlug);

  useEffect(() => {
    supabase
      .from("agents_config")
      .select("slug, nome, ativo")
      .order("ativo", { ascending: false })
      .order("nome")
      .then(({ data }) => {
        if (data && data.length) {
          setAgents(data);
          if (!data.find((a) => a.slug === agentSlug)) setAgentSlug(data[0].slug);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "aprovados" | "pendentes">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AgentExample | null>(null);

  const filtered = useMemo(() => {
    return examples.filter((e) => {
      if (filter === "aprovados" && !e.aprovado) return false;
      if (filter === "pendentes" && e.aprovado) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        e.scenario.toLowerCase().includes(s) ||
        (e.tags || []).some((t) => t.toLowerCase().includes(s)) ||
        e.turns?.some((t) => t.content?.toLowerCase().includes(s))
      );
    });
  }, [examples, search, filter]);

  const stats = useMemo(() => {
    const total = examples.length;
    const aprovados = examples.filter((e) => e.aprovado).length;
    const avgScore =
      examples.length > 0
        ? examples.reduce((s, e) => s + (e.qualidade_score || 0), 0) / examples.length
        : 0;
    return { total, aprovados, avgScore };
  }, [examples]);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><MessageSquare className="h-3.5 w-3.5" /> Total</div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Aprovados</div>
            <p className="text-2xl font-bold mt-1">{stats.aprovados}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Star className="h-3.5 w-3.5 text-amber-500" /> Qualidade média</div>
            <p className="text-2xl font-bold mt-1">{stats.avgScore.toFixed(1)}<span className="text-sm text-muted-foreground">/10</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs"><Sparkles className="h-3.5 w-3.5 text-primary" /> Injetados em prompt</div>
            <p className="text-2xl font-bold mt-1">{Math.min(stats.aprovados, 5)}<span className="text-sm text-muted-foreground"> top-5</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">Biblioteca Few-shot</CardTitle>
              <Select value={agentSlug} onValueChange={setAgentSlug}>
                <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.slug} value={a.slug}>
                      {a.nome} {!a.ativo && "(inativo)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Novo exemplo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cenário, tag ou conteúdo..." className="pl-9" />
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
              <TabsList>
                <TabsTrigger value="all">Todos</TabsTrigger>
                <TabsTrigger value="aprovados">Aprovados</TabsTrigger>
                <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* List */}
          <div className="space-y-2">
            {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {!loading && filtered.length === 0 && (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum exemplo. Crie o primeiro para calibrar este agente.</p>
              </div>
            )}
            {filtered.map((ex) => (
              <div key={ex.id} className="border rounded-lg p-4 hover:border-primary/50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h4 className="font-semibold text-sm">{ex.scenario}</h4>
                      {ex.aprovado ? (
                        <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Aprovado
                        </Badge>
                      ) : (
                        <Badge variant="outline"><Circle className="h-3 w-3 mr-1" /> Pendente</Badge>
                      )}
                      {ex.qualidade_score !== null && (
                        <Badge variant="secondary"><Star className="h-3 w-3 mr-1 text-amber-500" /> {ex.qualidade_score}/10</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mb-2">
                      {ex.cliente_tipo && <span>Cliente: {ex.cliente_tipo}</span>}
                      {ex.tom_cliente && <span>· Tom: {ex.tom_cliente}</span>}
                      {ex.fonte && <span>· Fonte: {ex.fonte}</span>}
                      <span>· {ex.turns?.length || 0} turnos</span>
                    </div>
                    {ex.tags && ex.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap mb-2">
                        {ex.tags.map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    )}
                    {ex.turns?.[0] && (
                      <p className="text-xs text-muted-foreground italic line-clamp-2">
                        👤 "{ex.turns[0].content}"
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggleApproval(ex.id, !ex.aprovado)}>
                      {ex.aprovado ? "Desaprovar" : "Aprovar"}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(ex); setDialogOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Remover este exemplo?")) remove(ex.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AgentExampleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agentSlug={agentSlug}
        example={editing}
        onSave={upsert}
      />
    </div>
  );
}
