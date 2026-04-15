import { useState } from "react";
import { useLeadObservations } from "@/hooks/useLeadObservations";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { Lead } from "@/types/lead";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { aiService } from "@/lib/services/aiService";

interface Props {
  lead: Lead;
  obs: ReturnType<typeof useLeadObservations>;
}

export function AISummaryTab({ lead, obs }: Props) {
  const { getLeadInteractions } = useLeadsContext();
  const [summary, setSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);

  const handleGenerateSummary = async () => {
    setLoadingSummary(true);
    setSummary("");
    try {
      const interactions = getLeadInteractions(lead.id);
      const { data, error } = await aiService.generateSummary(lead, interactions, obs.notes);
      if (error) throw error;
      setSummary(data.summary);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar resumo");
    }
    setLoadingSummary(false);
  };

  return (
    <div className="space-y-3">
      <Button onClick={handleGenerateSummary} disabled={loadingSummary} className="w-full gap-2 text-xs">
        {loadingSummary ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        Gerar Resumo Inteligente
      </Button>
      {summary && (
        <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 prose prose-sm max-w-none">
          <div className="text-xs leading-relaxed [&>h1]:text-sm [&>h2]:text-xs [&>h3]:text-xs [&>p]:text-xs [&>ul]:text-xs [&>ol]:text-xs [&>li]:text-xs">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        </div>
      )}
      {!summary && !loadingSummary && (
        <p className="text-xs text-muted-foreground text-center py-4">
          A IA vai analisar o histórico do lead (interações, notas e dados) para gerar um resumo executivo com próximos passos recomendados.
        </p>
      )}
    </div>
  );
}
