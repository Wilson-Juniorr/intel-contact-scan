import { useState, useCallback } from "react";
import { Lead, FunnelStage, Interaction } from "@/types/lead";

const MOCK_LEADS: Lead[] = [
  {
    id: "1",
    name: "Maria Silva",
    phone: "11999887766",
    email: "maria@email.com",
    type: "PF",
    plan_type: "Familiar",
    operator: "Unimed",
    lives: 4,
    stage: "cotacao_enviada",
    notes: "Interessada no plano familiar com coparticipação",
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-02-07T14:00:00Z",
    last_contact_at: "2026-02-07T14:00:00Z",
  },
  {
    id: "2",
    name: "João Santos",
    phone: "11988776655",
    type: "PJ",
    plan_type: "Empresarial",
    operator: "Bradesco Saúde",
    lives: 25,
    stage: "contato_realizado",
    created_at: "2026-02-03T09:00:00Z",
    updated_at: "2026-02-06T11:00:00Z",
    last_contact_at: "2026-02-06T11:00:00Z",
  },
  {
    id: "3",
    name: "Ana Costa",
    phone: "11977665544",
    email: "ana.costa@empresa.com",
    type: "PME",
    plan_type: "PME",
    operator: "SulAmérica",
    lives: 8,
    stage: "novo",
    created_at: "2026-02-08T08:00:00Z",
    updated_at: "2026-02-08T08:00:00Z",
  },
  {
    id: "4",
    name: "Carlos Oliveira",
    phone: "11966554433",
    type: "PF",
    plan_type: "Individual",
    operator: "Amil",
    lives: 1,
    stage: "tentativa_contato",
    created_at: "2026-02-05T15:00:00Z",
    updated_at: "2026-02-08T09:00:00Z",
    last_contact_at: "2026-02-08T09:00:00Z",
  },
  {
    id: "5",
    name: "Fernanda Lima",
    phone: "11955443322",
    type: "PF",
    plan_type: "Familiar",
    operator: "Hapvida",
    lives: 3,
    stage: "cotacao_aprovada",
    created_at: "2026-01-20T10:00:00Z",
    updated_at: "2026-02-07T16:00:00Z",
    last_contact_at: "2026-02-07T16:00:00Z",
  },
  {
    id: "6",
    name: "Roberto Almeida",
    phone: "11944332211",
    type: "ADESAO",
    plan_type: "Adesão",
    operator: "Porto Seguro",
    lives: 50,
    stage: "implantado",
    created_at: "2026-01-10T10:00:00Z",
    updated_at: "2026-02-01T10:00:00Z",
    last_contact_at: "2026-02-01T10:00:00Z",
  },
  {
    id: "7",
    name: "Patrícia Souza",
    phone: "11933221100",
    type: "PF",
    plan_type: "Individual",
    stage: "cancelado",
    lost_reason: "Preço alto",
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-02-02T10:00:00Z",
    last_contact_at: "2026-02-02T10:00:00Z",
  },
];

const MOCK_INTERACTIONS: Interaction[] = [
  { id: "i1", lead_id: "1", type: "whatsapp", description: "Enviado tabela de preços Unimed Familiar", created_at: "2026-02-07T14:00:00Z" },
  { id: "i2", lead_id: "1", type: "call", description: "Ligação para apresentar opções de coparticipação", created_at: "2026-02-05T10:00:00Z" },
  { id: "i3", lead_id: "2", type: "email", description: "Cotação enviada por email - Bradesco Saúde 25 vidas", created_at: "2026-02-06T11:00:00Z" },
  { id: "i4", lead_id: "4", type: "call", description: "Primeiro contato, lead quer plano individual básico", created_at: "2026-02-08T09:00:00Z" },
];

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>(MOCK_LEADS);
  const [interactions, setInteractions] = useState<Interaction[]>(MOCK_INTERACTIONS);

  const addLead = useCallback((lead: Omit<Lead, "id" | "created_at" | "updated_at">) => {
    const newLead: Lead = {
      ...lead,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setLeads((prev) => [newLead, ...prev]);
    return newLead;
  }, []);

  const updateLead = useCallback((id: string, updates: Partial<Lead>) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates, updated_at: new Date().toISOString() } : l))
    );
  }, []);

  const moveStage = useCallback((id: string, stage: FunnelStage, lost_reason?: string) => {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, stage, lost_reason, updated_at: new Date().toISOString() } : l
      )
    );
  }, []);

  const addInteraction = useCallback((interaction: Omit<Interaction, "id" | "created_at">) => {
    const newInteraction: Interaction = {
      ...interaction,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    setInteractions((prev) => [newInteraction, ...prev]);
    setLeads((prev) =>
      prev.map((l) =>
        l.id === interaction.lead_id
          ? { ...l, last_contact_at: new Date().toISOString(), updated_at: new Date().toISOString() }
          : l
      )
    );
  }, []);

  const getLeadInteractions = useCallback(
    (leadId: string) => interactions.filter((i) => i.lead_id === leadId),
    [interactions]
  );

  return { leads, addLead, updateLead, moveStage, interactions, addInteraction, getLeadInteractions };
}
