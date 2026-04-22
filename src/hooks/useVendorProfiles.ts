import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type VendorProfile = {
  id: string;
  slug: string;
  nome: string;
  origem: string | null;
  descricao: string | null;
  tom: string | null;
  estilo: string | null;
  principios: string | null;
  exemplos_frases: string[];
  quando_usar: string | null;
  evitar_quando: string | null;
  tags: string[];
  cor_hex: string;
  icone: string;
  ativo: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export function useVendorProfiles() {
  const [profiles, setProfiles] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vendor_profiles")
      .select("*")
      .order("is_default", { ascending: false })
      .order("nome");
    if (error) toast.error("Erro ao carregar cérebros: " + error.message);
    setProfiles(((data as any[]) || []).map((p) => ({
      ...p,
      exemplos_frases: Array.isArray(p.exemplos_frases) ? p.exemplos_frases : [],
      tags: Array.isArray(p.tags) ? p.tags : [],
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const upsert = async (payload: Partial<VendorProfile> & { nome: string; slug: string }) => {
    const { error } = payload.id
      ? await supabase.from("vendor_profiles").update(payload).eq("id", payload.id)
      : await supabase.from("vendor_profiles").insert(payload as any);
    if (error) { toast.error(error.message); return false; }
    toast.success(payload.id ? "Cérebro atualizado" : "Cérebro criado");
    await load();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("vendor_profiles").delete().eq("id", id);
    if (error) { toast.error(error.message); return false; }
    toast.success("Cérebro removido");
    await load();
    return true;
  };

  const toggleActive = async (p: VendorProfile) => {
    await supabase.from("vendor_profiles").update({ ativo: !p.ativo }).eq("id", p.id);
    await load();
  };

  return { profiles, loading, reload: load, upsert, remove, toggleActive };
}