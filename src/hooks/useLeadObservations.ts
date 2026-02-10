import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const NOTE_CATEGORIES = [
  { value: "geral", label: "Geral" },
  { value: "negociacao", label: "Negociação" },
  { value: "documentacao", label: "Documentação" },
  { value: "reclamacao", label: "Reclamação" },
  { value: "financeiro", label: "Financeiro" },
  { value: "tecnico", label: "Técnico" },
] as const;

export const DOC_CATEGORIES = [
  { value: "rg_cpf", label: "RG / CPF" },
  { value: "comprovante_residencia", label: "Comprovante de Residência" },
  { value: "cartao_sus", label: "Cartão SUS" },
  { value: "contrato_social", label: "Contrato Social" },
  { value: "proposta", label: "Proposta" },
  { value: "declaracao_saude", label: "Declaração de Saúde" },
  { value: "outros", label: "Outros" },
] as const;

const CHECKLIST_BY_TYPE: Record<string, string[]> = {
  PF: ["RG / CPF", "Comprovante de Residência", "Cartão SUS", "Declaração de Saúde", "Proposta Assinada"],
  ADESAO: ["RG / CPF", "Comprovante de Residência", "Cartão SUS", "Declaração de Saúde", "Carta de Adesão", "Comprovante de Vínculo"],
  PME: ["Contrato Social", "Cartão CNPJ", "RG / CPF dos Titulares", "Declaração de Saúde", "Relação de Beneficiários", "Proposta Assinada"],
};

export function useLeadObservations(leadId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const notesQuery = useQuery({
    queryKey: ["lead_notes", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_notes")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!leadId && !!user,
  });

  const documentsQuery = useQuery({
    queryKey: ["lead_documents", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_documents")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!leadId && !!user,
  });

  const checklistQuery = useQuery({
    queryKey: ["lead_checklist", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_checklist")
        .select("*")
        .eq("lead_id", leadId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!leadId && !!user,
  });

  const addNoteMutation = useMutation({
    mutationFn: async (note: { content: string; category: string; tags: string[] }) => {
      const { error } = await supabase.from("lead_notes").insert({
        lead_id: leadId!,
        user_id: user!.id,
        ...note,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead_notes", leadId] }),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from("lead_notes").delete().eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead_notes", leadId] }),
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async (params: { file: File; category: string; memberId?: string }) => {
      const filePath = `${user!.id}/${leadId}/${Date.now()}_${params.file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("lead-images")
        .upload(filePath, params.file);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("lead_documents").insert({
        lead_id: leadId!,
        user_id: user!.id,
        file_name: params.file.name,
        file_path: filePath,
        file_type: params.file.type,
        file_size: params.file.size,
        category: params.category,
        member_id: params.memberId || null,
      });
      if (dbError) throw dbError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead_documents", leadId] }),
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (doc: { id: string; file_path: string }) => {
      await supabase.storage.from("lead-images").remove([doc.file_path]);
      const { error } = await supabase.from("lead_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead_documents", leadId] }),
  });

  const initChecklistMutation = useMutation({
    mutationFn: async (leadType: string) => {
      const items = CHECKLIST_BY_TYPE[leadType] || CHECKLIST_BY_TYPE.PF;
      const { error } = await supabase.from("lead_checklist").insert(
        items.map((item) => ({
          lead_id: leadId!,
          user_id: user!.id,
          item_name: item,
        }))
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead_checklist", leadId] }),
  });

  const toggleChecklistMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase.from("lead_checklist").update({ completed }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead_checklist", leadId] }),
  });

  return {
    notes: notesQuery.data || [],
    documents: documentsQuery.data || [],
    checklist: checklistQuery.data || [],
    isLoading: notesQuery.isLoading || documentsQuery.isLoading || checklistQuery.isLoading,
    addNote: addNoteMutation.mutateAsync,
    deleteNote: deleteNoteMutation.mutateAsync,
    uploadDocument: uploadDocumentMutation.mutateAsync,
    deleteDocument: deleteDocumentMutation.mutateAsync,
    initChecklist: initChecklistMutation.mutateAsync,
    toggleChecklist: toggleChecklistMutation.mutateAsync,
  };
}
