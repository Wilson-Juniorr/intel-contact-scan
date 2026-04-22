import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type TechniqueExample = { situacao: string; cliente: string; agente: string };

export type SalesTechnique = {
  id: string;
  slug: string;
  nome: string;
  categoria: string;
  descricao: string | null;
  como_aplicar: string;
  exemplos: TechniqueExample[];
  gatilho_uso: string | null;
  fonte_autor: string | null;
  nivel_dificuldade: number;
  cor_hex: string;
  icone: string;
  ativo: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export const TECHNIQUE_CATEGORIES = [
  { value: "rapport", label: "Rapport / Conexão", color: "#3B82F6" },
  { value: "descoberta", label: "Descoberta", color: "#8B5CF6" },
  { value: "objecao", label: "Objeção", color: "#F59E0B" },
  { value: "fechamento", label: "Fechamento", color: "#10B981" },
  { value: "urgencia", label: "Urgência", color: "#EC4899" },
] as const;

export function useSalesTechniques() {
  const [techniques, setTechniques] = useState<SalesTechnique[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_techniques")
      .select("*")
      .order("categoria")
      .order("nivel_dificuldade")
      .order("nome");
    if (error) toast.error("Erro ao carregar técnicas: " + error.message);
    setTechniques(((data as any[]) || []).map((t) => ({
      ...t,
      exemplos: Array.isArray(t.exemplos) ? t.exemplos : [],
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const upsert = async (payload: Partial<SalesTechnique> & { nome: string; slug: string; categoria: string; como_aplicar: string }) => {
    const { error } = payload.id
      ? await supabase.from("sales_techniques").update(payload).eq("id", payload.id)
      : await supabase.from("sales_techniques").insert(payload as any);
    if (error) { toast.error(error.message); return false; }
    toast.success(payload.id ? "Técnica atualizada" : "Técnica criada");
    await load();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("sales_techniques").delete().eq("id", id);
    if (error) { toast.error(error.message); return false; }
    toast.success("Técnica removida");
    await load();
    return true;
  };

  const toggleActive = async (t: SalesTechnique) => {
    await supabase.from("sales_techniques").update({ ativo: !t.ativo }).eq("id", t.id);
    await load();
  };

  return { techniques, loading, reload: load, upsert, remove, toggleActive };
}