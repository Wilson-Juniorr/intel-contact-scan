import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ClosingSequence {
  id: string;
  lead_id: string;
  user_id: string;
  status: string;
  current_step: number;
  paused_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClosingStep {
  id: string;
  sequence_id: string;
  user_id: string;
  step_number: number;
  step_type: string;
  scheduled_at: string;
  status: string;
  ai_analysis: string | null;
  generated_message: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

const STEP_LABELS: Record<string, string> = {
  reforco_valor: "Reforço de Valor",
  tratamento_objecao: "Tratamento de Objeção",
  direcionar_decisao: "Direcionamento de Decisão",
  encerramento_elegante: "Encerramento Elegante",
};

export function getStepLabel(type: string) {
  return STEP_LABELS[type] || type;
}

export function useClosingSequence(leadId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Realtime
  useEffect(() => {
    if (!leadId) return;
    const channel = supabase
      .channel(`closing-${leadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "closing_sequences", filter: `lead_id=eq.${leadId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["closing-sequence", leadId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "closing_steps" }, () => {
        queryClient.invalidateQueries({ queryKey: ["closing-steps", leadId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [leadId, queryClient]);

  const sequenceQuery = useQuery({
    queryKey: ["closing-sequence", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closing_sequences")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ClosingSequence | null;
    },
    enabled: !!leadId && !!user,
  });

  const stepsQuery = useQuery({
    queryKey: ["closing-steps", leadId],
    queryFn: async () => {
      if (!sequenceQuery.data) return [];
      const { data, error } = await supabase
        .from("closing_steps")
        .select("*")
        .eq("sequence_id", sequenceQuery.data.id)
        .order("step_number");
      if (error) throw error;
      return data as ClosingStep[];
    },
    enabled: !!sequenceQuery.data,
  });

  const invokeAction = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("closing-engine", {
      body: { action, ...extra },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    queryClient.invalidateQueries({ queryKey: ["closing-sequence", leadId] });
    queryClient.invalidateQueries({ queryKey: ["closing-steps", leadId] });
    return data;
  };

  const startSequence = useMutation({
    mutationFn: () => invokeAction("create", { lead_id: leadId }),
  });

  const pauseSequence = useMutation({
    mutationFn: () => invokeAction("pause", { sequence_id: sequenceQuery.data?.id }),
  });

  const resumeSequence = useMutation({
    mutationFn: () => invokeAction("resume", { sequence_id: sequenceQuery.data?.id }),
  });

  const cancelSequence = useMutation({
    mutationFn: () => invokeAction("cancel", { sequence_id: sequenceQuery.data?.id }),
  });

  const markSent = useMutation({
    mutationFn: (stepId: string) => invokeAction("mark_sent", { step_id: stepId }),
  });

  const regenerateStep = useMutation({
    mutationFn: (stepId: string) => invokeAction("generate", { step_id: stepId }),
  });

  const updateMessage = useMutation({
    mutationFn: async ({ stepId, message }: { stepId: string; message: string }) => {
      const { error } = await supabase.from("closing_steps").update({ generated_message: message }).eq("id", stepId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["closing-steps", leadId] });
    },
  });

  return {
    sequence: sequenceQuery.data,
    steps: stepsQuery.data || [],
    isLoading: sequenceQuery.isLoading,
    startSequence,
    pauseSequence,
    resumeSequence,
    cancelSequence,
    markSent,
    regenerateStep,
    updateMessage,
  };
}
