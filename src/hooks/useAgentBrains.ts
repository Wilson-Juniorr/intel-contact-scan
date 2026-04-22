import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AgentVendorLink = {
  id: string;
  agent_slug: string;
  vendor_profile_id: string;
  peso: number;
  notas: string | null;
};

export type AgentTechniqueLink = {
  id: string;
  agent_slug: string;
  technique_id: string;
  prioridade: number;
  notas: string | null;
};

export function useAgentBrains(agentSlug: string | null) {
  const [vendorLinks, setVendorLinks] = useState<AgentVendorLink[]>([]);
  const [techniqueLinks, setTechniqueLinks] = useState<AgentTechniqueLink[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!agentSlug) return;
    setLoading(true);
    const [v, t] = await Promise.all([
      supabase.from("agent_vendor_profiles").select("*").eq("agent_slug", agentSlug),
      supabase.from("agent_techniques").select("*").eq("agent_slug", agentSlug),
    ]);
    setVendorLinks((v.data as AgentVendorLink[]) || []);
    setTechniqueLinks((t.data as AgentTechniqueLink[]) || []);
    setLoading(false);
  }, [agentSlug]);

  useEffect(() => { load(); }, [load]);

  const toggleVendor = async (vendorId: string, current: boolean, peso = 5) => {
    if (!agentSlug) return;
    if (current) {
      await supabase.from("agent_vendor_profiles").delete().eq("agent_slug", agentSlug).eq("vendor_profile_id", vendorId);
    } else {
      const { error } = await supabase.from("agent_vendor_profiles").insert({ agent_slug: agentSlug, vendor_profile_id: vendorId, peso });
      if (error) { toast.error(error.message); return; }
    }
    load();
  };

  const updateVendorPeso = async (vendorId: string, peso: number) => {
    if (!agentSlug) return;
    await supabase.from("agent_vendor_profiles").update({ peso }).eq("agent_slug", agentSlug).eq("vendor_profile_id", vendorId);
    load();
  };

  const toggleTechnique = async (techniqueId: string, current: boolean, prioridade = 5) => {
    if (!agentSlug) return;
    if (current) {
      await supabase.from("agent_techniques").delete().eq("agent_slug", agentSlug).eq("technique_id", techniqueId);
    } else {
      const { error } = await supabase.from("agent_techniques").insert({ agent_slug: agentSlug, technique_id: techniqueId, prioridade });
      if (error) { toast.error(error.message); return; }
    }
    load();
  };

  const updateTechniquePrioridade = async (techniqueId: string, prioridade: number) => {
    if (!agentSlug) return;
    await supabase.from("agent_techniques").update({ prioridade }).eq("agent_slug", agentSlug).eq("technique_id", techniqueId);
    load();
  };

  return { vendorLinks, techniqueLinks, loading, reload: load, toggleVendor, updateVendorPeso, toggleTechnique, updateTechniquePrioridade };
}