import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Loader2, CheckCircle2, XCircle } from "lucide-react";

type Row = {
  cerebro_declarado: string | null;
  tecnica_declarada: string | null;
  semantic_approved: boolean | null;
  semantic_confidence: number | null;
  semantic_reason: string | null;
  created_at: string;
};

type Agg = { nome: string; total: number; aprovados: number; conf_media: number };

export function AgentsMentesTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from("mente_usage_log")
        .select("cerebro_declarado, tecnica_declarada, semantic_approved, semantic_confidence, semantic_reason, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, []);

  function aggregate(field: "cerebro_declarado" | "tecnica_declarada"): Agg[] {
    const map = new Map<string, { total: number; aprovados: number; confSum: number }>();
    for (const r of rows) {
      const key = (r[field] ?? "").trim();
      if (!key) continue;
      const cur = map.get(key) ?? { total: 0, aprovados: 0, confSum: 0 };
      cur.total++;
      if (r.semantic_approved) cur.aprovados++;
      cur.confSum += Number(r.semantic_confidence) || 0;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([nome, v]) => ({ nome, total: v.total, aprovados: v.aprovados, conf_media: v.confSum / v.total }))
      .sort((a, b) => b.total - a.total);
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const totalTurns = rows.length;
  const aprovados = rows.filter((r) => r.semantic_approved).length;
  const taxaAncoragem = totalTurns ? (aprovados / totalTurns) * 100 : 0;
  const cerebros = aggregate("cerebro_declarado");
  const tecnicas = aggregate("tecnica_declarada");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2"><Brain className="h-5 w-5 text-primary" /> Mentes & Ancoragem</h2>
        <p className="text-xs text-muted-foreground">Quais cérebros/técnicas o SDR realmente usa — e se aplica de verdade ou só cita o nome (últimos 30 dias)</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Turnos auditados</p>
          <p className="text-2xl font-bold tabular-nums">{totalTurns}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Taxa de ancoragem real</p>
          <p className="text-2xl font-bold tabular-nums">{taxaAncoragem.toFixed(1)}%</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[10px] uppercase text-muted-foreground">Cérebros distintos usados</p>
          <p className="text-2xl font-bold tabular-nums">{cerebros.length}</p>
        </CardContent></Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <RankCard title="Cérebros mais usados" items={cerebros} />
        <RankCard title="Técnicas mais aplicadas" items={tecnicas} />
      </div>
    </div>
  );
}

function RankCard({ title, items }: { title: string; items: Agg[] }) {
  return (
    <Card><CardContent className="p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">Sem dados ainda</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 12).map((a) => {
            const taxa = (a.aprovados / a.total) * 100;
            return (
              <div key={a.nome} className="border border-border/50 rounded-lg p-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold truncate">{a.nome}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px] tabular-nums">{a.total}x</Badge>
                    {taxa >= 60
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      : <XCircle className="h-3.5 w-3.5 text-rose-500" />}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Ancoragem: <span className="font-semibold text-foreground tabular-nums">{taxa.toFixed(0)}%</span></span>
                  <span>Confiança média: <span className="tabular-nums">{a.conf_media.toFixed(2)}</span></span>
                </div>
                <div className="h-1 mt-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, taxa)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CardContent></Card>
  );
}