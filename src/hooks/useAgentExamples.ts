import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ExampleTurn {
  role: "user" | "assistant";
  content: string;
  nota?: string;
}

export interface AgentExample {
  id: string;
  agent_slug: string;
  scenario: string;
  cliente_tipo: string | null;
  tom_cliente: string | null;
  fonte: string | null;
  turns: ExampleTurn[];
  qualidade_score: number | null;
  aprovado: boolean;
  observacao: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export function useAgentExamples(agentSlug?: string) {
  const [examples, setExamples] = useState<AgentExample[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("agent_examples").select("*").order("updated_at", { ascending: false });
    if (agentSlug) q = q.eq("agent_slug", agentSlug);
    const { data, error } = await q;
    if (error) {
      toast.error("Erro ao carregar exemplos");
      console.error(error);
    } else {
      setExamples((data || []) as unknown as AgentExample[]);
    }
    setLoading(false);
  }, [agentSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const upsert = async (example: Partial<AgentExample> & { agent_slug: string; scenario: string; turns: ExampleTurn[] }) => {
    const payload: any = {
      agent_slug: example.agent_slug,
      scenario: example.scenario,
      cliente_tipo: example.cliente_tipo ?? null,
      tom_cliente: example.tom_cliente ?? null,
      fonte: example.fonte ?? "manual",
      turns: example.turns,
      qualidade_score: example.qualidade_score ?? null,
      aprovado: example.aprovado ?? false,
      observacao: example.observacao ?? null,
      tags: example.tags ?? [],
    };
    if (example.id) {
      const { error } = await supabase.from("agent_examples").update(payload).eq("id", example.id);
      if (error) { toast.error("Erro ao salvar"); return false; }
      toast.success("Exemplo atualizado");
    } else {
      const { error } = await supabase.from("agent_examples").insert(payload);
      if (error) { toast.error("Erro ao criar"); return false; }
      toast.success("Exemplo criado");
    }
    await load();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("agent_examples").delete().eq("id", id);
    if (error) { toast.error("Erro ao remover"); return; }
    toast.success("Exemplo removido");
    await load();
  };

  const toggleApproval = async (id: string, aprovado: boolean) => {
    const { error } = await supabase.from("agent_examples").update({ aprovado }).eq("id", id);
    if (error) { toast.error("Erro ao aprovar"); return; }
    await load();
  };

  return { examples, loading, reload: load, upsert, remove, toggleApproval };
}
