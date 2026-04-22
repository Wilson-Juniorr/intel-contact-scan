import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type Log = {
  id: string;
  conversation_id: string | null;
  mensagem_original: string;
  violacao_tipo: string;
  violacao_detalhe: string | null;
  mensagem_corrigida: string | null;
  acao_tomada: string | null;
  created_at: string;
};

const ACAO_STYLES: Record<string, string> = {
  bloqueada: "bg-destructive/10 text-destructive border-destructive/30",
  corrigida_auto: "bg-warning/10 text-warning border-warning/30",
  enviada_com_aviso: "bg-primary/10 text-primary border-primary/30",
};

export function AgentsComplianceTab() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("agent_compliance_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setLogs((data as Log[]) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (logs.length === 0) {
    return (
      <Card><CardContent className="py-16 text-center">
        <ShieldAlert className="h-10 w-10 mx-auto mb-3 text-success/40" />
        <p className="text-sm text-muted-foreground">Nenhuma violação registrada — bom trabalho!</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((l, i) => (
        <motion.div key={l.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
          <Card className="hover-card-lift">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <ShieldAlert className="h-4 w-4 text-warning" />
                <span className="text-sm font-medium">{l.violacao_tipo}</span>
                {l.acao_tomada && (
                  <Badge variant="outline" className={`text-[10px] ${ACAO_STYLES[l.acao_tomada] || ""}`}>{l.acao_tomada.replace("_", " ")}</Badge>
                )}
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {formatDistanceToNow(new Date(l.created_at), { locale: ptBR, addSuffix: true })}
                </span>
              </div>
              {l.violacao_detalhe && <p className="text-xs text-muted-foreground">{l.violacao_detalhe}</p>}
              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-destructive/20 bg-destructive/5 p-2">
                  <p className="text-[10px] text-destructive uppercase font-bold mb-1">Original</p>
                  <p className="line-clamp-3">{l.mensagem_original}</p>
                </div>
                {l.mensagem_corrigida && (
                  <div className="rounded border border-success/20 bg-success/5 p-2">
                    <p className="text-[10px] text-success uppercase font-bold mb-1">Corrigida</p>
                    <p className="line-clamp-3">{l.mensagem_corrigida}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
