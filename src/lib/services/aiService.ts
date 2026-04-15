import { supabase } from "@/integrations/supabase/client";

export const aiService = {
  chat: async (
    messages: { role: string; content: string }[],
    crmContext?: string,
    fileInfo?: unknown
  ) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    };
    if (session?.access_token) {
      headers["x-user-token"] = session.access_token;
    }
    return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages, crmContext, fileInfo }),
    });
  },

  generateSummary: (lead: unknown, interactions: unknown[], notes: unknown[]) =>
    supabase.functions.invoke("lead-summary", {
      body: { lead, interactions, notes },
    }),

  generateFollowUp: async (leadId: string, userContext?: string, extra?: Record<string, unknown>) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Não autenticado");
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/follow-up-message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ leadId, userContext, ...extra }),
      }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "Erro ao gerar mensagem");
    }
    return resp.json();
  },

  rewriteMessage: (currentText: string, leadId: string, tone: string, options?: unknown) =>
    supabase.functions.invoke("rewrite-message", {
      body: { currentText, leadId, tone, ...((options as Record<string, unknown>) || {}) },
    }),

  suggestTasks: async (leadId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Não autenticado");
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-tasks`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ leadId }),
      }
    );
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "Erro ao sugerir tarefas");
    }
    return resp.json();
  },

  nextBestAction: (leadIds: string[]) =>
    supabase.functions.invoke("next-best-action", { body: { leadIds } }),

  updateMemory: (leadId: string) =>
    supabase.functions.invoke("update-lead-memory", { body: { leadId } }),
};
