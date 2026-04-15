import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, ArrowRightLeft, MessageCircle, Sparkles, CheckCircle2, Paperclip, Loader2 } from "lucide-react";
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

const PAGE_SIZE = 50;

const ACTION_TYPES: Record<string, { label: string; icon: typeof UserPlus; color: string }> = {
  lead_created: { label: "Lead criado", icon: UserPlus, color: "text-primary" },
  lead_stage_changed: { label: "Lead movido", icon: ArrowRightLeft, color: "text-warning" },
  message_sent: { label: "Mensagem enviada", icon: MessageCircle, color: "text-emerald-500" },
  ai_used: { label: "IA usada", icon: Sparkles, color: "text-violet-500" },
  task_completed: { label: "Tarefa completada", icon: CheckCircle2, color: "text-primary" },
  document_uploaded: { label: "Documento enviado", icon: Paperclip, color: "text-orange-500" },
};

interface ActionLogEntry {
  id: string;
  action_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  lead_id: string;
  leads?: { name: string } | null;
}

export default function ActivityPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async (reset = false) => {
    if (!user) return;
    setLoading(true);
    const offset = reset ? 0 : logs.length;
    let query = supabase.from("action_log").select("*, leads(name)").eq("user_id", user.id).order("created_at", { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
    if (filter !== "all") query = query.eq("action_type", filter);
    const { data } = await query;
    const entries = (data || []) as unknown as ActionLogEntry[];
    if (reset) setLogs(entries); else setLogs(prev => [...prev, ...entries]);
    setHasMore(entries.length === PAGE_SIZE);
    setLoading(false);
  }, [user, logs.length, filter]);

  useEffect(() => { loadMore(true); }, [user, filter]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const obs = new IntersectionObserver(entries => { if (entries[0].isIntersecting && !loading) loadMore(); }, { threshold: 0.1 });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading, loadMore]);

  const grouped = logs.reduce<Record<string, ActionLogEntry[]>>((acc, log) => {
    const date = new Date(log.created_at);
    const key = isToday(date) ? "Hoje" : isYesterday(date) ? "Ontem" : format(date, "d 'de' MMMM", { locale: ptBR });
    (acc[key] ||= []).push(log);
    return acc;
  }, {});

  const filtered = search
    ? Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, v.filter(l => (l.leads as any)?.name?.toLowerCase().includes(search.toLowerCase()))]).filter(([, v]) => (v as ActionLogEntry[]).length > 0))
    : grouped;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Atividades</h1>
        <p className="text-muted-foreground text-sm">Histórico de ações no CRM</p>
      </div>

      <div className="flex gap-3">
        <Input placeholder="Buscar por lead..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={filter} onValueChange={v => { setFilter(v); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(ACTION_TYPES).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {Object.entries(filtered).length === 0 && !loading && (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma atividade registrada</p>
      )}

      {Object.entries(filtered).map(([day, entries]) => (
        <div key={day}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{day}</h3>
          <div className="space-y-2">
            {(entries as ActionLogEntry[]).map(entry => {
              const config = ACTION_TYPES[entry.action_type] || { label: entry.action_type, icon: Sparkles, color: "text-muted-foreground" };
              const Icon = config.icon;
              const meta = entry.metadata || {};
              let description = config.label;
              if (entry.action_type === "lead_stage_changed" && meta.from && meta.to) {
                description = `Movido de ${meta.from} → ${meta.to}`;
              }

              return (
                <Card key={entry.id} className="bg-card/50">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0 ${config.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{description}</p>
                      {(entry.leads as any)?.name && (
                        <p className="text-xs text-muted-foreground truncate">{(entry.leads as any).name}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      <div ref={sentinelRef} className="h-8 flex items-center justify-center">
        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}
