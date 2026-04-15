import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, RefreshCw, Loader2, Heart, AlertTriangle, DollarSign, Building2, Users, Target } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  leadId: string;
  leadName: string;
}

export function LeadMemoryCard({ leadId, leadName }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);

  const { data: memory, isLoading } = useQuery({
    queryKey: ["lead_memory", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_memory")
        .select("*")
        .eq("lead_id", leadId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!leadId,
  });

  const updateMemory = async () => {
    setUpdating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Não autenticado");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-lead-memory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ leadId }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro" }));
        throw new Error(err.error || "Erro ao atualizar memória");
      }

      await queryClient.invalidateQueries({ queryKey: ["lead_memory", leadId] });
      toast({ title: "Memória atualizada", description: `Resumo de ${leadName} foi atualizado com sucesso` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  const sj = (memory?.structured_json || {}) as any;
  const sentimentConfig: Record<string, { label: string; color: string; icon: typeof Heart }> = {
    positivo: { label: "Positivo", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: Heart },
    neutro: { label: "Neutro", color: "bg-muted text-muted-foreground border-border", icon: Target },
    negativo: { label: "Negativo", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", icon: AlertTriangle },
    frio: { label: "Frio", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: AlertTriangle },
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Memória do Lead</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1.5 h-7"
            onClick={updateMemory}
            disabled={updating}
          >
            {updating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {memory ? "Atualizar" : "Gerar memória"}
          </Button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && !memory && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Clique em "Gerar memória" para criar um resumo inteligente deste lead
          </p>
        )}

        {memory && (
          <>
            {/* Structured data badges */}
            <div className="flex flex-wrap gap-1.5">
              {sj.sentimento && sentimentConfig[sj.sentimento] && (
                <Badge variant="outline" className={`text-[10px] ${sentimentConfig[sj.sentimento].color}`}>
                  {sentimentConfig[sj.sentimento].label}
                </Badge>
              )}
              {sj.urgencia && (
                <Badge variant="outline" className="text-[10px]">
                  Urgência: {sj.urgencia}
                </Badge>
              )}
              {sj.orcamento && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <DollarSign className="h-2.5 w-2.5" />
                  {sj.orcamento}
                </Badge>
              )}
              {sj.vidas && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Users className="h-2.5 w-2.5" />
                  {sj.vidas} vidas
                </Badge>
              )}
            </div>

            {/* Summary */}
            {memory.summary && (
              <div className="bg-muted/30 rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap border border-border max-h-[200px] overflow-y-auto">
                {memory.summary}
              </div>
            )}

            {/* Key info */}
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              {sj.operadoras_discutidas?.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Operadoras:</span>
                  <p className="font-medium">{sj.operadoras_discutidas.join(", ")}</p>
                </div>
              )}
              {sj.rede_hospitais?.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Rede desejada:</span>
                  <p className="font-medium">{sj.rede_hospitais.join(", ")}</p>
                </div>
              )}
              {sj.objecoes?.length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Objeções:</span>
                  <p className="font-medium text-orange-400">{sj.objecoes.join(" • ")}</p>
                </div>
              )}
              {sj.proximos_passos?.length > 0 && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Próximos passos:</span>
                  <p className="font-medium text-primary">{sj.proximos_passos.join(" • ")}</p>
                </div>
              )}
            </div>

            <p className="text-[9px] text-muted-foreground text-right">
              Atualizado {formatDistanceToNow(new Date(memory.updated_at), { addSuffix: true, locale: ptBR })}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
