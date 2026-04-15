import { FUNNEL_STAGES } from "@/types/lead";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, CheckCircle2, Users, Building2, Clock, Loader2 } from "lucide-react";
import { buildWhatsAppUrl, type CadenceStatus } from "@/lib/cadence";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  lead: any;
  diasSemContato: number;
  status: CadenceStatus;
  onMarkDone: (leadId: string) => Promise<void>;
}

export function CadenceLeadCard({ lead, diasSemContato, status, onMarkDone }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);
  const whatsappUrl = buildWhatsAppUrl(lead.phone, lead.stage, lead.name);

  const daysColor =
    status === "atrasado"
      ? "text-destructive font-bold"
      : status === "hoje"
        ? "text-yellow-600 font-semibold"
        : "text-muted-foreground";

  const handleDone = async () => {
    setLoading(true);
    try {
      await onMarkDone(lead.id);
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {!done ? (
        <motion.div exit={{ opacity: 0, scale: 0.95, height: 0 }} transition={{ duration: 0.25 }}>
          <Card className="hover-card-lift border-border/50">
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{lead.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {lead.type}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[10px] gap-1"
                      style={{ borderColor: stageInfo?.color, color: stageInfo?.color }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ backgroundColor: stageInfo?.color }} />
                      {stageInfo?.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                    <span className={`flex items-center gap-1 ${daysColor}`}>
                      <Clock className="h-3 w-3" />
                      {diasSemContato}d sem contato
                      {status === "atrasado" && diasSemContato > 3 && (
                        <span className="status-dot-danger ml-1" />
                      )}
                    </span>
                    {lead.operator && (
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> {lead.operator}
                      </span>
                    )}
                    {lead.lives && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {lead.lives} vidas
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1 btn-press" asChild>
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                      <Phone className="h-3 w-3" /> WhatsApp
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-8 text-xs gap-1 bg-gradient-to-r from-primary to-blue-500 btn-press"
                    disabled={loading}
                    onClick={handleDone}
                  >
                    {loading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    Contato feito
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 1 }}
          animate={{ opacity: 0.4 }}
          className="text-center py-2 text-xs text-muted-foreground"
        >
          ✅ Contato registrado
        </motion.div>
      )}
    </AnimatePresence>
  );
}
