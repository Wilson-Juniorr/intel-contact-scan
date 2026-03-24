import { useState, useCallback } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { useTasks } from "@/hooks/useTasks";
import { useCadence } from "@/hooks/useCadence";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { CadenceSection } from "@/components/today/CadenceSection";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sparkles, Loader2, AlertTriangle, Clock, CheckCircle2,
} from "lucide-react";

// ── NBA types (preserved from original) ──
type Priority = "critico" | "urgente" | "atencao" | "ok";
interface NBAResult {
  id: string;
  priority: Priority;
  reason: string;
  suggested_action: string;
  suggested_message?: string;
  suggested_task?: string;
}

export default function TodayPage() {
  const { leads, updateLead } = useLeadsContext();
  const { markDone } = useTasks();
  const { atrasados, hoje, agendados, pendingCount } = useCadence();

  // NBA state (preserved)
  const [nbaResults, setNbaResults] = useState<Map<string, NBAResult>>(new Map());
  const [loadingNBA, setLoadingNBA] = useState(false);

  const handleMarkDone = useCallback(async (leadId: string) => {
    try {
      await markDone(leadId, "contact_done");
      toast({ title: "Contato registrado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }, [markDone]);

  // NBA generation (preserved)
  const generateNBA = useCallback(async () => {
    const activeLeads = leads.filter((l) => !["declinado", "cancelado"].includes(l.stage));
    if (!activeLeads.length) return;
    setLoadingNBA(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Não autenticado");

      const batches: string[][] = [];
      for (let i = 0; i < activeLeads.length; i += 20) {
        batches.push(activeLeads.slice(i, i + 20).map((l) => l.id));
      }

      const allResults = new Map<string, NBAResult>();
      for (let i = 0; i < batches.length; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 3000));
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/next-best-action`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ leadIds: batches[i] }),
        });
        if (resp.status === 429) {
          toast({ title: "Limite atingido", description: "Aguarde e tente novamente.", variant: "destructive" });
          break;
        }
        if (resp.status === 402) {
          toast({ title: "Créditos insuficientes", variant: "destructive" });
          break;
        }
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Erro" }));
          throw new Error(err.error || "Erro ao gerar sugestões");
        }
        const data = await resp.json();
        (data.results || []).forEach((r: NBAResult) => allResults.set(r.id, r));
      }
      setNbaResults(allResults);
      toast({ title: "Sugestões geradas", description: `${allResults.size} leads analisados` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoadingNBA(false);
    }
  }, [leads]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Central do Dia</h1>
        <p className="text-muted-foreground text-sm">
          Painel de cadência automática • {pendingCount} leads precisam de atenção
        </p>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3 flex-wrap">
        <Badge variant="outline" className="text-sm px-3 py-1 gap-1.5 bg-destructive/10 text-destructive border-destructive/30">
          <AlertTriangle className="h-3.5 w-3.5" /> {atrasados.length} atrasados
        </Badge>
        <Badge variant="outline" className="text-sm px-3 py-1 gap-1.5 bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
          <Clock className="h-3.5 w-3.5" /> {hoje.length} para hoje
        </Badge>
        <Badge variant="outline" className="text-sm px-3 py-1 gap-1.5 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
          <CheckCircle2 className="h-3.5 w-3.5" /> {agendados.length} agendados
        </Badge>
      </div>

      {/* Sections */}
      <CadenceSection title="Atrasados" items={atrasados} status="atrasado" onMarkDone={handleMarkDone} />
      <CadenceSection title="Contatar Hoje" items={hoje} status="hoje" onMarkDone={handleMarkDone} />
      <CadenceSection title="Próximos" items={agendados} status="agendado" defaultOpen={false} onMarkDone={handleMarkDone} />

      {/* NBA accordion (preserved) */}
      <Accordion type="single" collapsible>
        <AccordionItem value="nba" className="border rounded-lg">
          <AccordionTrigger className="px-4 py-3 text-sm font-semibold hover:no-underline">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Análise avançada IA
              {nbaResults.size > 0 && (
                <Badge variant="secondary" className="text-[10px]">{nbaResults.size} resultados</Badge>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <Button onClick={generateNBA} disabled={loadingNBA} size="sm" className="gap-2">
              {loadingNBA ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {nbaResults.size ? "Atualizar sugestões" : "Gerar sugestões IA"}
            </Button>
            {nbaResults.size > 0 && (
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {Array.from(nbaResults.values()).map((r) => (
                  <div key={r.id} className="flex gap-2">
                    <Badge variant="outline" className="text-[10px] shrink-0">{r.priority}</Badge>
                    <span>{r.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
