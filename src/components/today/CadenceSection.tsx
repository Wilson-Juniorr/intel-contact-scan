import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  atrasado: "border-destructive/30 gradient-card-red",
  hoje: "border-yellow-500/30 gradient-card-amber",
  agendado: "border-emerald-500/30 gradient-card-green",
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
        <motion.div animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronRight className="h-4 w-4" />
        </motion.div>
        <span className={`font-semibold text-sm ${titleStyles[status]}`}>
          {emojis[status]} {items.length} leads {subtitles[status]}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-2 mt-3">
              {items.map((item, i) => (
                <motion.div
                  key={item.lead.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <CadenceLeadCard
                    lead={item.lead}
                    diasSemContato={item.diasSemContato}
                    status={item.status}
                    onMarkDone={onMarkDone}
                  />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
