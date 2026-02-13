import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { FunnelStage } from "@/types/lead";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useLeadsDB() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Realtime subscription: auto-refresh leads on any DB change
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("leads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["leads"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const leadsQuery = useQuery({
    queryKey: ["leads", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const interactionsQuery = useQuery({
    queryKey: ["interactions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("interactions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addLeadMutation = useMutation({
    mutationFn: async (lead: {
      name: string;
      phone: string;
      email?: string;
      type: string;
      plan_type?: string;
      operator?: string;
      lives?: number;
      notes?: string;
      stage: string;
    }) => {
      const { data, error } = await supabase
        .from("leads")
        .insert({ ...lead, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;

      // Auto-link existing WhatsApp messages & contacts to this new lead
      const digits = data.phone.replace(/\D/g, "");
      const normalized = digits.startsWith("55") ? digits : `55${digits}`;

      // Link messages
      await supabase
        .from("whatsapp_messages")
        .update({ lead_id: data.id })
        .eq("phone", normalized)
        .eq("user_id", user!.id)
        .is("lead_id", null);

      // Link contact
      await supabase
        .from("whatsapp_contacts")
        .update({ lead_id: data.id })
        .eq("phone", normalized)
        .eq("user_id", user!.id);

      // Initialize lead_memory
      await supabase.from("lead_memory").upsert({
        user_id: user!.id,
        lead_id: data.id,
        summary: null,
        structured_json: {},
      }, { onConflict: "lead_id" });

      // Update last_contact_at from most recent message
      const { data: lastMsg } = await supabase
        .from("whatsapp_messages")
        .select("created_at")
        .eq("lead_id", data.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastMsg) {
        await supabase.from("leads").update({ last_contact_at: lastMsg.created_at }).eq("id", data.id);
      }

      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase.from("leads").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  const moveStageMutation = useMutation({
    mutationFn: async ({ id, stage, lost_reason }: { id: string; stage: FunnelStage; lost_reason?: string }) => {
      const { error } = await supabase.from("leads").update({ stage, lost_reason }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, stage, lost_reason }) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const previous = queryClient.getQueryData(["leads", user?.id]);
      queryClient.setQueryData(["leads", user?.id], (old: any[] | undefined) =>
        (old || []).map((l) => l.id === id ? { ...l, stage, lost_reason: lost_reason ?? l.lost_reason, updated_at: new Date().toISOString() } : l)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["leads", user?.id], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  const deleteLeadsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("leads").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  const addInteractionMutation = useMutation({
    mutationFn: async (interaction: { lead_id: string; type: string; description: string }) => {
      const { error: intError } = await supabase
        .from("interactions")
        .insert({ ...interaction, user_id: user!.id });
      if (intError) throw intError;

      await supabase.from("leads").update({ last_contact_at: new Date().toISOString() }).eq("id", interaction.lead_id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interactions"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const getLeadInteractions = useCallback(
    (leadId: string) => (interactionsQuery.data || []).filter((i) => i.lead_id === leadId),
    [interactionsQuery.data]
  );

  return {
    leads: leadsQuery.data || [],
    isLoading: leadsQuery.isLoading,
    interactions: interactionsQuery.data || [],
    addLead: addLeadMutation.mutateAsync,
    updateLead: (id: string, updates: Record<string, unknown>) => updateLeadMutation.mutateAsync({ id, updates }),
    moveStage: (id: string, stage: FunnelStage, lost_reason?: string) => moveStageMutation.mutateAsync({ id, stage, lost_reason }),
    deleteLeads: (ids: string[]) => deleteLeadsMutation.mutateAsync(ids),
    addInteraction: addInteractionMutation.mutateAsync,
    getLeadInteractions,
  };
}
