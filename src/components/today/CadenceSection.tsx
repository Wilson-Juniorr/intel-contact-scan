import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CadenceLeadCard } from "./CadenceLeadCard";
import type { LeadWithCadence, CadenceStatus } from "@/lib/cadence";

interface Props {
  title: string;
  items: LeadWithCadence[];
  status: CadenceStatus;
  defaultOpen?: boolean;
  onMarkDone: (leadId: string) => Promise<void>;
}

const sectionStyles: Record<CadenceStatus, string> = {
  atrasado: "border-destructive/30 bg-destructive/5",
  hoje: "border-yellow-500/30 bg-yellow-500/5",
  agendado: "border-emerald-500/30 bg-emerald-500/5",
};

const titleStyles: Record<CadenceStatus, string> = {
  atrasado: "text-destructive",
  hoje: "text-yellow-600",
  agendado: "text-emerald-600",
};

const emojis: Record<CadenceStatus, string> = {
  atrasado: "🔴",
  hoje: "🟡",
  agendado: "🟢",
};

const subtitles: Record<CadenceStatus, string> = {
  atrasado: "deveriam ter sido contactados",
  hoje: "para contatar hoje",
  agendado: "agendados para os próximos dias",
};

export function CadenceSection({ title, items, status, defaultOpen = true, onMarkDone }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  if (items.length === 0) return null;

  return (
    <div className={`rounded-lg border p-3 ${sectionStyles[status]}`}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full text-left">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className={`font-semibold text-sm ${titleStyles[status]}`}>
          {emojis[status]} {items.length} leads {subtitles[status]}
        </span>
      </button>
      {open && (
        <div className="space-y-2 mt-3">
          {items.map((item) => (
            <CadenceLeadCard
              key={item.lead.id}
              lead={item.lead}
              diasSemContato={item.diasSemContato}
              status={item.status}
              onMarkDone={onMarkDone}
            />
          ))}
        </div>
      )}
    </div>
  );
}
