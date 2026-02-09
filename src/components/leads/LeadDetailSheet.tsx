import { useState } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { Lead, FUNNEL_STAGES } from "@/types/lead";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeadObservationsPanel } from "@/components/leads/LeadObservationsPanel";
import { MessageCircle, Phone, Mail, User, Building, Heart, Clock, Info, StickyNote, Maximize2, Minimize2 } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  lead: Lead | null;
  onClose: () => void;
}

function LeadDetailContent({ lead, isFullscreen }: { lead: Lead; isFullscreen: boolean }) {
  const { getLeadInteractions } = useLeadsContext();
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
    <Tabs defaultValue="info" className="mt-4">
      <TabsList className={`w-full grid grid-cols-2 h-9`}>
        <TabsTrigger value="info" className="text-xs gap-1">
          <Info className="h-3 w-3" /> Informações
        </TabsTrigger>
        <TabsTrigger value="observations" className="text-xs gap-1">
          <StickyNote className="h-3 w-3" /> Observações
        </TabsTrigger>
      </TabsList>

      <TabsContent value="info" className={`space-y-5 mt-3 ${isFullscreen ? "grid grid-cols-1 md:grid-cols-2 gap-6 space-y-0" : ""}`}>
        {/* Left / Contact + Details */}
        <div className="space-y-5">
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

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Criado: {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}</p>
            <p>Atualizado: {formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true, locale: ptBR })}</p>
            {lead.last_contact_at && (
              <p>Último contato: {formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: true, locale: ptBR })}</p>
            )}
          </div>
        </div>

        {/* Right / Timeline */}
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
      </TabsContent>

      <TabsContent value="observations" className="mt-3">
        <LeadObservationsPanel lead={lead} />
      </TabsContent>
    </Tabs>
  );
}

export function LeadDetailSheet({ lead, onClose }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!lead) return null;

  const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);

  const header = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
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
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={(e) => { e.stopPropagation(); setIsFullscreen(!isFullscreen); }}
        title={isFullscreen ? "Voltar ao painel lateral" : "Abrir em tela cheia"}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>
    </div>
  );

  if (isFullscreen) {
    return (
      <>
        {/* Keep sheet hidden but mounted so closing works */}
        <Sheet open={!!lead} onOpenChange={() => { setIsFullscreen(false); onClose(); }}>
          <SheetContent className="hidden"><SheetHeader><SheetTitle /></SheetHeader></SheetContent>
        </Sheet>
        <Dialog open onOpenChange={() => { setIsFullscreen(false); onClose(); }}>
          <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle asChild>{header}</DialogTitle>
            </DialogHeader>
            <LeadDetailContent lead={lead} isFullscreen />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Sheet open={!!lead} onOpenChange={() => { setIsFullscreen(false); onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle asChild>{header}</SheetTitle>
        </SheetHeader>
        <LeadDetailContent lead={lead} isFullscreen={false} />
      </SheetContent>
    </Sheet>
  );
}
