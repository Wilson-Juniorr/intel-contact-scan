import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/types/lead";

export const leadService = {
  getAll: (userId: string) =>
    supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),

  getById: (id: string) => supabase.from("leads").select("*").eq("id", id).single(),

  create: (lead: Partial<Lead> & { name: string; phone: string; user_id: string }) =>
    supabase.from("leads").insert(lead).select().single(),

  update: (id: string, data: Partial<Lead>) =>
    supabase
      .from("leads")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", id),

  softDelete: (ids: string[]) =>
    supabase
      .from("leads")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids),

  restore: (ids: string[]) =>
    supabase.from("leads").update({ deleted_at: null }).in("id", ids),

  moveStage: (id: string, stage: string, lost_reason?: string) =>
    supabase
      .from("leads")
      .update({ stage, lost_reason, updated_at: new Date().toISOString() })
      .eq("id", id),
};
