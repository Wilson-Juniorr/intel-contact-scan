import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, MessageCircle, UserCheck, Pause, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";

type Conv = {
  id: string;
  lead_id: string | null;
  agent_slug: string;
  whatsapp_number: string;
  status: string;
  ultima_atividade: string;
  iniciada_em: string;
  mensagens: any[];
  total_tokens_in: number;
  total_tokens_out: number;
  custo_estimado: number;
  leads?: { name: string } | null;
};

const STATUS_STYLES: Record<string, string> = {
  ativa: "bg-success/10 text-success border-success/30",
  pausada: "bg-warning/10 text-warning border-warning/30",
  encerrada: "bg-muted text-muted-foreground",
  transferida_humano: "bg-primary/10 text-primary border-primary/30",
};

export function AgentsConversationsTab() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ativa");
  const [selected, setSelected] = useState<Conv | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("agent_conversations")
      .select("*, leads(name)")
      .order("ultima_atividade", { ascending: false })
      .limit(100);
    if (filter !== "todas") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) toast.error("Erro ao carregar conversas");
    setConvs((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("agent_conversations").update({ status }).eq("id", id);
    toast.success("Status atualizado");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {["ativa", "pausada", "transferida_humano", "encerrada", "todas"].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filter === s ? "default" : "outline"}
            onClick={() => setFilter(s)}
            className="btn-press capitalize"
          >
            {s.replace("_", " ")}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : convs.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          Nenhuma conversa {filter !== "todas" ? `"${filter}"` : ""} no momento
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {convs.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Card className="hover-card-lift cursor-pointer" onClick={() => setSelected(c)}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/30 to-blue-400/20 flex items-center justify-center shrink-0">
                    <MessageCircle className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{c.leads?.name || c.whatsapp_number}</span>
                      <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[c.status]}`}>{c.status.replace("_", " ")}</Badge>
                      <Badge variant="outline" className="text-[10px]">{c.agent_slug}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(c.mensagens?.length || 0)} mensagens · ${c.custo_estimado.toFixed(4)} · {formatDistanceToNow(new Date(c.ultima_atividade), { locale: ptBR, addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {c.status === "ativa" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(c.id, "transferida_humano")} className="btn-press">
                        <UserCheck className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {c.status === "ativa" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(c.id, "pausada")} className="btn-press">
                        <Pause className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selected?.leads?.name || selected?.whatsapp_number}</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-4 space-y-2">
              <div className="text-xs text-muted-foreground border-b pb-2">
                Agent: <span className="font-mono">{selected.agent_slug}</span> · {(selected.mensagens?.length || 0)} msgs · ${selected.custo_estimado.toFixed(4)}
              </div>
              {(selected.mensagens || []).map((m: any, i: number) => (
                <div key={i} className={`p-2.5 rounded-xl text-sm max-w-[85%] ${
                  m.role === "user"
                    ? "bg-muted/50 self-start"
                    : "bg-gradient-to-br from-primary/90 to-primary text-primary-foreground self-end ml-auto"
                }`}>
                  {m.content}
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
