import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const VINCULO_OPTIONS = [
  "Cônjuge",
  "Filho(a)",
  "Pai/Mãe",
  "Irmão(ã)",
  "Enteado(a)",
  "Sobrinho(a)",
  "Outro",
] as const;

export interface LeadMember {
  id: string;
  lead_id: string;
  user_id: string;
  role: "titular" | "dependente";
  name: string;
  cpf: string | null;
  birth_date: string | null;
  email: string | null;
  phone: string | null;
  vinculo: string | null;
  created_at: string;
  updated_at: string;
}

export function useLeadMembers(leadId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["lead_members", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_members")
        .select("*")
        .eq("lead_id", leadId!)
        .order("role", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as LeadMember[];
    },
    enabled: !!leadId && !!user,
  });

  const addMember = useMutation({
    mutationFn: async (member: {
      role: "titular" | "dependente";
      name: string;
      cpf?: string;
      birth_date?: string;
      email?: string;
      phone?: string;
      vinculo?: string;
    }) => {
      const { data, error } = await supabase
        .from("lead_members")
        .insert({ ...member, lead_id: leadId!, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead_members", leadId] }),
  });

  const updateMember = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      const { error } = await supabase.from("lead_members").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead_members", leadId] }),
  });

  const deleteMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead_members", leadId] });
      qc.invalidateQueries({ queryKey: ["lead_documents", leadId] });
    },
  });

  const members = query.data || [];

  return {
    members,
    titulares: members.filter((m) => m.role === "titular"),
    dependentes: members.filter((m) => m.role === "dependente"),
    isLoading: query.isLoading,
    addMember: addMember.mutateAsync,
    updateMember: (id: string, updates: Record<string, unknown>) => updateMember.mutateAsync({ id, updates }),
    deleteMember: deleteMember.mutateAsync,
  };
}
