import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useTasks(leadId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("tasks-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => {
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const tasksQuery = useQuery({
    queryKey: ["tasks", user?.id, leadId],
    queryFn: async () => {
      let query = supabase
        .from("tasks")
        .select("*")
        .order("due_at", { ascending: true, nullsFirst: false });
      if (leadId) query = query.eq("lead_id", leadId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addTask = useMutation({
    mutationFn: async (task: {
      lead_id: string;
      title: string;
      notes?: string;
      due_at?: string;
    }) => {
      const { data, error } = await supabase
        .from("tasks")
        .insert({ ...task, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const completeTask = useMutation({
    mutationFn: async ({ taskId, leadId }: { taskId: string; leadId: string }) => {
      // Mark task as done
      const { error } = await supabase.from("tasks").update({ status: "done" }).eq("id", taskId);
      if (error) throw error;

      // Log action
      await supabase.from("action_log").insert({
        user_id: user!.id,
        lead_id: leadId,
        action_type: "task_completed",
        metadata: { task_id: taskId },
      });

      // Create interaction for timeline
      await supabase.from("interactions").insert({
        user_id: user!.id,
        lead_id: leadId,
        type: "note",
        description: "✅ Tarefa concluída via Central do Dia",
      });

      // Update lead last_contact_at
      await supabase
        .from("leads")
        .update({ last_contact_at: new Date().toISOString() })
        .eq("id", leadId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["interactions"] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const markDone = useMutation({
    mutationFn: async ({
      leadId,
      actionType,
      metadata,
    }: {
      leadId: string;
      actionType: string;
      metadata?: any;
    }) => {
      // Log action
      await supabase.from("action_log").insert({
        user_id: user!.id,
        lead_id: leadId,
        action_type: actionType,
        metadata: metadata || {},
      });

      // Create interaction
      await supabase.from("interactions").insert({
        user_id: user!.id,
        lead_id: leadId,
        type: "note",
        description: `✅ Ação realizada: ${actionType}`,
      });

      // Update lead
      await supabase
        .from("leads")
        .update({ last_contact_at: new Date().toISOString() })
        .eq("id", leadId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["interactions"] });
    },
  });

  return {
    tasks: tasksQuery.data || [],
    isLoading: tasksQuery.isLoading,
    addTask: addTask.mutateAsync,
    completeTask: (taskId: string, leadId: string) => completeTask.mutateAsync({ taskId, leadId }),
    deleteTask: deleteTask.mutateAsync,
    markDone: (leadId: string, actionType: string, metadata?: any) =>
      markDone.mutateAsync({ leadId, actionType, metadata }),
    openTasks: (tasksQuery.data || []).filter((t: any) => t.status === "open"),
    todayTasks: (tasksQuery.data || []).filter((t: any) => {
      if (t.status !== "open") return false;
      if (!t.due_at) return true;
      return new Date(t.due_at) <= new Date(new Date().toDateString() + " 23:59:59");
    }),
  };
}
