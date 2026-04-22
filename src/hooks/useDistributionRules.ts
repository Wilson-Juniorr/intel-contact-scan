import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type DistributionRule = {
  id: string;
  nome: string;
  descricao: string | null;
  prioridade: number;
  ativo: boolean;
  filtro_tipo: string[];
  filtro_origem: string[];
  filtro_estagio: string[];
  filtro_palavras_chave: string[];
  agente_alvo: string | null;
  agentes_pool: string[];
  modo_distribuicao: "fixo" | "round_robin" | "menos_carga";
  horario_inicio: string;
  horario_fim: string;
  dias_semana: number[];
  fora_horario_acao: "agendar" | "humano" | "ignorar";
  max_leads_dia: number | null;
  created_at: string;
  updated_at: string;
};

export type RoutingLog = {
  id: string;
  lead_id: string | null;
  rule_id: string | null;
  rule_nome: string | null;
  agente_escolhido: string | null;
  motivo: string | null;
  contexto: any;
  created_at: string;
};

export function useDistributionRules() {
  const [rules, setRules] = useState<DistributionRule[]>([]);
  const [logs, setLogs] = useState<RoutingLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, l] = await Promise.all([
      supabase.from("lead_distribution_rules" as any).select("*").order("prioridade", { ascending: false }),
      supabase.from("lead_routing_log" as any).select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    if (r.error) toast.error("Erro ao carregar regras: " + r.error.message);
    setRules(((r.data as any[]) || []).map((x: any) => ({
      ...x,
      filtro_tipo: x.filtro_tipo || [],
      filtro_origem: x.filtro_origem || [],
      filtro_estagio: x.filtro_estagio || [],
      filtro_palavras_chave: x.filtro_palavras_chave || [],
      agentes_pool: x.agentes_pool || [],
      dias_semana: x.dias_semana || [],
    })));
    setLogs((l.data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const upsert = async (payload: Partial<DistributionRule> & { nome: string }) => {
    const { error } = payload.id
      ? await supabase.from("lead_distribution_rules" as any).update(payload as any).eq("id", payload.id)
      : await supabase.from("lead_distribution_rules" as any).insert(payload as any);
    if (error) { toast.error(error.message); return false; }
    toast.success(payload.id ? "Regra atualizada" : "Regra criada");
    await load();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("lead_distribution_rules" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return false; }
    toast.success("Regra removida");
    await load();
    return true;
  };

  const toggleActive = async (r: DistributionRule) => {
    await supabase.from("lead_distribution_rules" as any).update({ ativo: !r.ativo }).eq("id", r.id);
    await load();
  };

  return { rules, logs, loading, reload: load, upsert, remove, toggleActive };
}