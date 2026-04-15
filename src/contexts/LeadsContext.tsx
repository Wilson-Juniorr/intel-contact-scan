import React, { createContext, useContext, ReactNode } from "react";
import { useLeadsDB } from "@/hooks/useLeadsDB";
import type { Lead, Interaction, FunnelStage } from "@/types/lead";

interface LeadsContextType {
  leads: Lead[];
  isLoading: boolean;
  addLead: (lead: {
    name: string;
    phone: string;
    email?: string;
    type: string;
    plan_type?: string;
    operator?: string;
    lives?: number;
    notes?: string;
    stage: string;
  }) => Promise<Lead>;
  updateLead: (id: string, updates: Record<string, unknown>) => Promise<void>;
  moveStage: (id: string, stage: FunnelStage, lost_reason?: string) => Promise<void>;
  deleteLeads: (ids: string[]) => Promise<string[]>;
  restoreLeads: (ids: string[]) => Promise<void>;
  interactions: Interaction[];
  addInteraction: (interaction: {
    lead_id: string;
    type: string;
    description: string;
  }) => Promise<void>;
  getLeadInteractions: (leadId: string) => Interaction[];
}

const LeadsContext = createContext<LeadsContextType | null>(null);

export function LeadsProvider({ children }: { children: ReactNode }) {
  const leadsData = useLeadsDB();
  return <LeadsContext.Provider value={leadsData}>{children}</LeadsContext.Provider>;
}

export function useLeadsContext() {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error("useLeadsContext must be used within LeadsProvider");
  return ctx;
}
