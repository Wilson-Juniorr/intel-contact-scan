import React, { createContext, useContext, ReactNode } from "react";
import { useLeads } from "@/hooks/useLeads";
import type { Lead, FunnelStage, Interaction } from "@/types/lead";

interface LeadsContextType {
  leads: Lead[];
  addLead: (lead: Omit<Lead, "id" | "created_at" | "updated_at">) => Lead;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  moveStage: (id: string, stage: FunnelStage, lost_reason?: string) => void;
  interactions: Interaction[];
  addInteraction: (interaction: Omit<Interaction, "id" | "created_at">) => void;
  getLeadInteractions: (leadId: string) => Interaction[];
}

const LeadsContext = createContext<LeadsContextType | null>(null);

export function LeadsProvider({ children }: { children: ReactNode }) {
  const leadsData = useLeads();
  return <LeadsContext.Provider value={leadsData}>{children}</LeadsContext.Provider>;
}

export function useLeadsContext() {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error("useLeadsContext must be used within LeadsProvider");
  return ctx;
}
