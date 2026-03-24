import { useMemo } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { classifyLeads } from "@/lib/cadence";

export function useCadence() {
  const { leads } = useLeadsContext();

  const { atrasados, hoje, agendados } = useMemo(() => classifyLeads(leads), [leads]);

  return {
    atrasados,
    hoje,
    agendados,
    pendingCount: atrasados.length + hoje.length,
  };
}
