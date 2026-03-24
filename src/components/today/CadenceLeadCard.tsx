import { FUNNEL_STAGES } from "@/types/lead";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, CheckCircle2, Users, Building2, Clock, Loader2 } from "lucide-react";
import { buildWhatsAppUrl, type CadenceStatus } from "@/lib/cadence";
import { useState } from "react";

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
    <Card className={`transition-all ${done ? "opacity-40" : ""}`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{lead.name}</span>
              <Badge variant="secondary" className="text-[10px]">{lead.type}</Badge>
              <Badge
                variant="outline"
                className="text-[10px]"
                style={{ borderColor: stageInfo?.color, color: stageInfo?.color }}
              >
                {stageInfo?.label}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
              <span className={`flex items-center gap-1 ${daysColor}`}>
                <Clock className="h-3 w-3" />
                {diasSemContato}d sem contato
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
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" asChild>
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <Phone className="h-3 w-3" /> WhatsApp
              </a>
            </Button>
            <Button
              size="sm"
              variant={done ? "secondary" : "default"}
              className="h-8 text-xs gap-1"
              disabled={done || loading}
              onClick={handleDone}
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              {done ? "Feito" : "Contato feito"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
