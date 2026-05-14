import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Shield, ShieldAlert, MessageSquare, Activity, Clock, Filter } from "lucide-react";
import { motion } from "framer-motion";

type Period = "24h" | "7d" | "30d";

type Snapshot = {
  qual: { A: number; B: number; C: number; D: number; total: number };
  avgHandoffMinutes: number | null;
  handoffSample: number;
  gateBlocks: number;
  complianceBlocks: number;
  attemptsBaseline: number;
  manual: number;
  automatic: number;
  recentBlocks: Array<{
    id: string;
    created_at: string;
    kind: "gate" | "compliance";
    tipo: string;
    detalhe: string | null;
    acao: string | null;
  }>;
  agentsSeen: string[];
};

const PERIOD_HOURS: Record<Period, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

function sinceISO(p: Period): string {
  return new Date(Date.now() - PERIOD_HOURS[p] * 3_600_000).toISOString();
}

function pct(n: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

export function AgentsOperationsTab() {
  const [period, setPeriod] = useState<Period>("7d");
  const [agent, setAgent] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = sinceISO(period);

      // ───── Conversas no período (para qual score + agentes vistos) ─────
      let convQ = supabase
        .from("agent_conversations")
        .select("id, agent_slug, iniciada_em, conversation_state, lead_id")
        .gte("iniciada_em", since);
      if (agent !== "all") convQ = convQ.eq("agent_slug", agent);
      const { data: convs } = await convQ;

      const qual = { A: 0, B: 0, C: 0, D: 0, total: 0 };
      const agentsSeen = new Set<string>();
      const convById = new Map<string, { agent_slug: string; iniciada_em: string; lead_id: string | null }>();
      (convs ?? []).forEach((c: any) => {
        agentsSeen.add(c.agent_slug);
        const score = c.conversation_state?.qual_progress?.score as "A" | "B" | "C" | "D" | undefined;
        if (score && qual[score] !== undefined) {
          qual[score]++;
          qual.total++;
        }
        convById.set(c.id, { agent_slug: c.agent_slug, iniciada_em: c.iniciada_em, lead_id: c.lead_id });
      });

      // ───── Handoffs no período ─────
      const { data: handoffs } = await supabase
        .from("agent_handoffs")
        .select("conversation_id, created_at, from_agent")
        .gte("created_at", since)
        .limit(500);
      let totalMin = 0;
      let handoffSample = 0;
      (handoffs ?? []).forEach((h: any) => {
        if (agent !== "all" && h.from_agent !== agent) return;
        const conv = convById.get(h.conversation_id);
        if (!conv) return;
        const start = new Date(conv.iniciada_em).getTime();
        const end = new Date(h.created_at).getTime();
        if (end > start) {
          totalMin += (end - start) / 60_000;
          handoffSample++;
        }
      });
      const avgHandoffMinutes = handoffSample > 0 ? totalMin / handoffSample : null;

      // ───── Bloqueios (gate + guardião) via agent_compliance_log ─────
      const { data: blocks } = await supabase
        .from("agent_compliance_log")
        .select("id, created_at, violacao_tipo, violacao_detalhe, acao_tomada, conversation_id, mensagem_original")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);

      let gateBlocks = 0;
      let complianceBlocks = 0;
      const recentBlocks: Snapshot["recentBlocks"] = [];
      (blocks ?? []).forEach((b: any) => {
        const isGate = String(b.violacao_tipo).startsWith("gate_block:");
        const isCompliance = String(b.violacao_tipo).startsWith("guardian:");
        // filtro por agent: tenta resolver via conv ou pelo detalhe JSON
        if (agent !== "all") {
          const conv = b.conversation_id ? convById.get(b.conversation_id) : null;
          let matches = conv?.agent_slug === agent;
          if (!matches && b.violacao_detalhe) {
            try {
              const parsed = JSON.parse(b.violacao_detalhe);
              matches = parsed?.agent_slug === agent;
            } catch { /* noop */ }
          }
          if (!matches) return;
        }
        if (isGate) gateBlocks++;
        if (isCompliance) complianceBlocks++;
        if (recentBlocks.length < 12 && (isGate || isCompliance)) {
          recentBlocks.push({
            id: b.id,
            created_at: b.created_at,
            kind: isGate ? "gate" : "compliance",
            tipo: b.violacao_tipo,
            detalhe: b.violacao_detalhe,
            acao: b.acao_tomada,
          });
        }
      });

      // Baseline de tentativas para taxa: msgs outbound automáticas no período
      let attemptsBaseline = 0;
      try {
        const { count } = await supabase
          .from("action_log")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since)
          .in("action_type", ["automation_blocked", "compliance_blocked", "agent_message_sent"]);
        attemptsBaseline = count ?? 0;
      } catch { /* opcional */ }
      if (!attemptsBaseline) attemptsBaseline = (convs?.length ?? 0) + gateBlocks + complianceBlocks;

      // ───── Manual vs Automático (snapshot atual de leads ativos) ─────
      const { data: leadsManual } = await supabase
        .from("leads")
        .select("in_manual_conversation")
        .is("deleted_at", null);
      const manual = (leadsManual ?? []).filter((l: any) => l.in_manual_conversation).length;
      const automatic = (leadsManual ?? []).length - manual;

      if (cancelled) return;
      setSnap({
        qual,
        avgHandoffMinutes,
        handoffSample,
        gateBlocks,
        complianceBlocks,
        attemptsBaseline,
        manual,
        automatic,
        recentBlocks,
        agentsSeen: Array.from(agentsSeen).sort(),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [period, agent]);

  const cards = useMemo(() => {
    if (!snap) return [];
    const handoff = snap.avgHandoffMinutes;
    return [
      {
        label: "Score A (qualificado)",
        value: pct(snap.qual.A, snap.qual.total),
        sub: `${snap.qual.A}/${snap.qual.total} convs`,
        icon: Activity,
        gradient: "gradient-card-green",
      },
      {
        label: "Tempo médio até handoff",
        value: handoff == null ? "—" : handoff < 60 ? `${handoff.toFixed(1)} min` : `${(handoff / 60).toFixed(1)}h`,
        sub: `${snap.handoffSample} handoffs`,
        icon: Clock,
        gradient: "gradient-card-blue",
      },
      {
        label: "Bloqueios por gate",
        value: snap.gateBlocks.toString(),
        sub: `${pct(snap.gateBlocks, snap.attemptsBaseline)} das tentativas`,
        icon: Shield,
        gradient: "gradient-card-amber",
      },
      {
        label: "Bloqueios por compliance",
        value: snap.complianceBlocks.toString(),
        sub: `${pct(snap.complianceBlocks, snap.attemptsBaseline)} das tentativas`,
        icon: ShieldAlert,
        gradient: "gradient-card-amber",
      },
      {
        label: "Conversas em manual",
        value: snap.manual.toString(),
        sub: `vs ${snap.automatic} em IA`,
        icon: MessageSquare,
        gradient: "gradient-card-blue",
      },
    ];
  }, [snap]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filtros:
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Últimas 24h</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
          </SelectContent>
        </Select>
        <Select value={agent} onValueChange={setAgent}>
          <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os agentes</SelectItem>
            {(snap?.agentsSeen ?? []).map((a) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[88px] rounded-xl" />
            ))
          : cards.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className={`${c.gradient} hover-card-lift border-border/50`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{c.label}</p>
                      <c.icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-xl font-bold">{c.value}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{c.sub}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
      </div>

      {/* Distribuição A/B/C/D */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Distribuição de qualificação</h3>
            <span className="text-xs text-muted-foreground">{snap?.qual.total ?? 0} convs com score</span>
          </div>
          {loading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {(["A", "B", "C", "D"] as const).map((k) => {
                const v = snap?.qual[k] ?? 0;
                const total = snap?.qual.total ?? 0;
                const tone =
                  k === "A" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                  : k === "B" ? "bg-blue-500/15 text-blue-600 border-blue-500/30"
                  : k === "C" ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                  : "bg-muted text-muted-foreground border-border";
                return (
                  <div key={k} className={`rounded-lg border p-3 ${tone}`}>
                    <div className="text-[11px] uppercase tracking-wide opacity-80">Score {k}</div>
                    <div className="text-2xl font-bold leading-tight">{v}</div>
                    <div className="text-[11px] opacity-70">{pct(v, total)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Últimos bloqueios */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Últimos bloqueios</h3>
            <span className="text-xs text-muted-foreground">
              {snap?.recentBlocks.length ?? 0} eventos
            </span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (snap?.recentBlocks.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum bloqueio no período selecionado.
            </p>
          ) : (
            <div className="space-y-1.5">
              {snap!.recentBlocks.map((b) => {
                const reason = b.tipo
                  .replace(/^gate_block:/, "")
                  .replace(/^guardian:/, "");
                let summary = reason;
                let agentSlug: string | null = null;
                if (b.detalhe) {
                  try {
                    const p = JSON.parse(b.detalhe);
                    if (p.violations?.length) {
                      summary = p.violations.map((v: any) => v.detalhe || v.tipo).join(" · ");
                    } else if (p.detail) {
                      summary = p.detail;
                    }
                    agentSlug = p.agent_slug ?? null;
                  } catch { /* noop */ }
                }
                return (
                  <div
                    key={b.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-card/50 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={
                            b.kind === "gate"
                              ? "text-[10px] border-amber-500/40 text-amber-600"
                              : "text-[10px] border-rose-500/40 text-rose-600"
                          }
                        >
                          {b.kind === "gate" ? "Gate" : "Compliance"}
                        </Badge>
                        <span className="text-xs font-mono">{reason}</span>
                        {agentSlug && (
                          <span className="text-[10px] text-muted-foreground">· {agentSlug}</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{summary}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(b.created_at).toLocaleString("pt-BR", {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}