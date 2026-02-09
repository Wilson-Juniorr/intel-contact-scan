import { useLeadsContext } from "@/contexts/LeadsContext";
import { Lead, FUNNEL_STAGES } from "@/types/lead";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MessageCircle, Phone, Mail, User, Building, Heart, Clock } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  lead: Lead | null;
  onClose: () => void;
}

export function LeadDetailSheet({ lead, onClose }: Props) {
  const { getLeadInteractions } = useLeadsContext();

  if (!lead) return null;

  const interactions = getLeadInteractions(lead.id);
  const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);

  const whatsappUrl = `https://wa.me/55${lead.phone.replace(/\D/g, "")}`;

  const iconMap: Record<string, React.ReactNode> = {
    call: <Phone className="h-3.5 w-3.5" />,
    whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
    meeting: <User className="h-3.5 w-3.5" />,
    email: <Mail className="h-3.5 w-3.5" />,
    note: <Clock className="h-3.5 w-3.5" />,
  };

  return (
    <Sheet open={!!lead} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">
                {lead.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </span>
            </div>
            <div>
              <p className="text-lg font-bold">{lead.name}</p>
              <Badge variant="outline" className="text-[10px]" style={{ borderColor: stageInfo?.color, color: stageInfo?.color }}>
                {stageInfo?.label}
              </Badge>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Contact */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">Contato</h3>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{lead.phone}</span>
            </div>
            {lead.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{lead.email}</span>
              </div>
            )}
            <Button asChild size="sm" className="w-full gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground">
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
              </a>
            </Button>
          </div>

          <Separator />

          {/* Details */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">Detalhes</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Tipo</span>
                <p className="font-medium">{lead.type}</p>
              </div>
              {lead.plan_type && (
                <div>
                  <span className="text-muted-foreground text-xs">Plano</span>
                  <p className="font-medium">{lead.plan_type}</p>
                </div>
              )}
              {lead.operator && (
                <div>
                  <span className="text-muted-foreground text-xs">Operadora</span>
                  <p className="font-medium">{lead.operator}</p>
                </div>
              )}
              {lead.lives && (
                <div>
                  <span className="text-muted-foreground text-xs">Vidas</span>
                  <p className="font-medium">{lead.lives}</p>
                </div>
              )}
            </div>
            {lead.notes && (
              <div>
                <span className="text-muted-foreground text-xs">Observações</span>
                <p className="text-sm mt-1">{lead.notes}</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Timeline */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">Timeline</h3>
            {interactions.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma interação registrada</p>
            )}
            {interactions.map((int) => (
              <div key={int.id} className="flex gap-3">
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  {iconMap[int.type] || <Clock className="h-3.5 w-3.5" />}
                </div>
                <div>
                  <p className="text-sm">{int.description}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(int.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Separator />

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Criado: {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}</p>
            <p>Atualizado: {formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true, locale: ptBR })}</p>
            {lead.last_contact_at && (
              <p>Último contato: {formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: true, locale: ptBR })}</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
