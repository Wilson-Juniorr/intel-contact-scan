import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type RewarmingCampaign = {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  agente_slug: string;
  dias_inativo_min: number;
  estagios_alvo: string[];
  excluir_perdidos: boolean;
  filtro_tipo: string[];
  max_tentativas: number;
  intervalo_dias: number;
  horario_envio: string;
  dias_semana: number[];
  mensagens_template: string[];
  tom: string | null;
  objetivo: string | null;
  created_at: string;
  updated_at: string;
};

export type RewarmingPoolItem = {
  id: string;
  lead_id: string;
  campaign_id: string;
  status: string;
  tentativas_feitas: number;
  proxima_execucao: string;
  ultima_resposta_em: string | null;
  motivo_saida: string | null;
  enrolled_at: string;
  lead_nome?: string;
  lead_phone?: string;
  campaign_nome?: string;
};

export function useRewarming() {
  const [campaigns, setCampaigns] = useState<RewarmingCampaign[]>([]);
  const [pool, setPool] = useState<RewarmingPoolItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      supabase.from("rewarming_campaigns" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("rewarming_pool" as any).select("*, leads(name,phone), rewarming_campaigns(nome)").order("proxima_execucao"),
    ]);
    if (c.error) toast.error("Erro ao carregar campanhas: " + c.error.message);
    setCampaigns(((c.data as any[]) || []).map((x: any) => ({
      ...x,
      estagios_alvo: x.estagios_alvo || [],
      filtro_tipo: x.filtro_tipo || [],
      dias_semana: x.dias_semana || [],
      mensagens_template: Array.isArray(x.mensagens_template) ? x.mensagens_template : [],
    })));
    setPool(((p.data as any[]) || []).map((x: any) => ({
      ...x,
      lead_nome: x.leads?.name,
      lead_phone: x.leads?.phone,
      campaign_nome: x.rewarming_campaigns?.nome,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const upsertCampaign = async (payload: Partial<RewarmingCampaign> & { nome: string; agente_slug: string }) => {
    const { error } = payload.id
      ? await supabase.from("rewarming_campaigns" as any).update(payload as any).eq("id", payload.id)
      : await supabase.from("rewarming_campaigns" as any).insert(payload as any);
    if (error) { toast.error(error.message); return false; }
    toast.success(payload.id ? "Campanha atualizada" : "Campanha criada");
    await load();
    return true;
  };

  const removeCampaign = async (id: string) => {
    const { error } = await supabase.from("rewarming_campaigns" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return false; }
    toast.success("Campanha removida");
    await load();
    return true;
  };

  const toggleCampaign = async (c: RewarmingCampaign) => {
    await supabase.from("rewarming_campaigns" as any).update({ ativo: !c.ativo }).eq("id", c.id);
    await load();
  };

  const enrollLeads = async (campaign_id: string) => {
    const { data, error } = await supabase.functions.invoke("rewarming-enroll", { body: { campaign_id } });
    if (error) { toast.error(error.message); return; }
    toast.success(`${data?.enrolled || 0} leads enrolados`);
    await load();
  };

  const runNow = async () => {
    const { data, error } = await supabase.functions.invoke("rewarming-execute", { body: {} });
    if (error) { toast.error(error.message); return; }
    toast.success(`${data?.executados || 0} toques executados`);
    await load();
  };

  const removeFromPool = async (id: string) => {
    await supabase.from("rewarming_pool" as any).update({ status: "desistiu", motivo_saida: "manual" }).eq("id", id);
    await load();
  };

  return { campaigns, pool, loading, reload: load, upsertCampaign, removeCampaign, toggleCampaign, enrollLeads, runNow, removeFromPool };
}