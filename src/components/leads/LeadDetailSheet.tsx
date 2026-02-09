import { useState } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { Lead, FUNNEL_STAGES, FunnelStage } from "@/types/lead";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeadObservationsPanel } from "@/components/leads/LeadObservationsPanel";
import {
  MessageCircle, Phone, Mail, User, Clock, Info, StickyNote,
  Maximize2, Minimize2, Pencil, Save, X, Loader2, Trash2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

interface Props {
  lead: Lead | null;
  onClose: () => void;
}

interface EditForm {
  name: string;
  phone: string;
  email: string;
  type: string;
  plan_type: string;
  operator: string;
  lives: string;
  notes: string;
  stage: string;
  lost_reason: string;
}

function leadToForm(lead: Lead): EditForm {
  return {
    name: lead.name,
    phone: lead.phone,
    email: lead.email || "",
    type: lead.type,
    plan_type: lead.plan_type || "",
    operator: lead.operator || "",
    lives: lead.lives ? String(lead.lives) : "",
    notes: lead.notes || "",
    stage: lead.stage,
    lost_reason: lead.lost_reason || "",
  };
}

function LeadEditForm({ lead, onSaved, onCancel }: { lead: Lead; onSaved: () => void; onCancel: () => void }) {
  const { updateLead } = useLeadsContext();
  const [form, setForm] = useState<EditForm>(leadToForm(lead));
  const [saving, setSaving] = useState(false);

  const set = (field: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: "Nome e telefone são obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateLead(lead.id, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        type: form.type,
        plan_type: form.plan_type || null,
        operator: form.operator.trim() || null,
        lives: form.lives ? parseInt(form.lives) : null,
        notes: form.notes.trim() || null,
        stage: form.stage,
        lost_reason: form.lost_reason.trim() || null,
      });
      toast({ title: "Lead atualizado com sucesso!" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const needsLostReason = form.stage === "declinado" || form.stage === "cancelado";

  return (
    <div className="space-y-4 mt-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <Label className="text-xs">Nome *</Label>
          <Input value={form.name} onChange={set("name")} placeholder="Nome do lead" className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Telefone *</Label>
          <Input value={form.phone} onChange={set("phone")} placeholder="11999887766" className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input value={form.email} onChange={set("email")} placeholder="email@exemplo.com" type="email" className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PF">Pessoa Física</SelectItem>
              <SelectItem value="ADESAO">Adesão</SelectItem>
              <SelectItem value="PME">PME</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Tipo de Plano</Label>
          <Select value={form.plan_type || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, plan_type: v === "_none" ? "" : v }))}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Nenhum</SelectItem>
              <SelectItem value="Individual">Individual</SelectItem>
              <SelectItem value="Familiar">Familiar</SelectItem>
              <SelectItem value="Adesão">Adesão</SelectItem>
              <SelectItem value="PME">PME</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Operadora</Label>
          <Input value={form.operator} onChange={set("operator")} placeholder="Ex: Unimed, Amil..." className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Qtd. Vidas</Label>
          <Input value={form.lives} onChange={set("lives")} placeholder="1" type="number" min="1" className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Etapa do Funil</Label>
          <Select value={form.stage} onValueChange={(v) => setForm((f) => ({ ...f, stage: v }))}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FUNNEL_STAGES.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {needsLostReason && (
          <div>
            <Label className="text-xs">Motivo da Perda</Label>
            <Input value={form.lost_reason} onChange={set("lost_reason")} placeholder="Motivo..." className="h-9 text-sm" />
          </div>
        )}
        <div className="md:col-span-2">
          <Label className="text-xs">Observações</Label>
          <Textarea value={form.notes} onChange={set("notes")} placeholder="Notas sobre o lead..." rows={3} className="text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1 gap-1.5 h-9 text-sm">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar Alterações
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving} className="h-9 text-sm gap-1.5">
          <X className="h-3.5 w-3.5" /> Cancelar
        </Button>
      </div>
    </div>
  );
}

function LeadDetailContent({ lead, isFullscreen, isEditing, onStartEdit, onStopEdit }: {
  lead: Lead; isFullscreen: boolean; isEditing: boolean; onStartEdit: () => void; onStopEdit: () => void;
}) {
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
      <TabsList className={`w-full grid ${isEditing ? "grid-cols-1" : "grid-cols-2"} h-9`}>
        <TabsTrigger value="info" className="text-xs gap-1">
          <Info className="h-3 w-3" /> {isEditing ? "Editando Lead" : "Informações"}
        </TabsTrigger>
        {!isEditing && (
          <TabsTrigger value="observations" className="text-xs gap-1">
            <StickyNote className="h-3 w-3" /> Observações
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="info">
        {isEditing ? (
          <LeadEditForm lead={lead} onSaved={onStopEdit} onCancel={onStopEdit} />
        ) : (
          <div className={`space-y-5 mt-3 ${isFullscreen ? "grid grid-cols-1 md:grid-cols-2 gap-6 space-y-0" : ""}`}>
            {/* Left / Contact + Details */}
            <div className="space-y-5">
              {/* Edit button */}
              <Button variant="outline" size="sm" onClick={onStartEdit} className="w-full gap-1.5 h-8 text-xs">
                <Pencil className="h-3 w-3" /> Editar dados do lead
              </Button>

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
                {lead.lost_reason && (
                  <div>
                    <span className="text-muted-foreground text-xs">Motivo da Perda</span>
                    <p className="text-sm mt-1 text-destructive">{lead.lost_reason}</p>
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
          </div>
        )}
      </TabsContent>

      {!isEditing && (
        <TabsContent value="observations" className="mt-3">
          <LeadObservationsPanel lead={lead} />
        </TabsContent>
      )}
    </Tabs>
  );
}

export function LeadDetailSheet({ lead, onClose }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  if (!lead) return null;

  const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);

  const handleClose = () => {
    setIsFullscreen(false);
    setIsEditing(false);
    onClose();
  };

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
      <div className="flex items-center gap-1">
        {!isEditing && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            title="Editar lead"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
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
    </div>
  );

  if (isFullscreen) {
    return (
      <>
        <Sheet open={!!lead} onOpenChange={handleClose}>
          <SheetContent className="hidden"><SheetHeader><SheetTitle /></SheetHeader></SheetContent>
        </Sheet>
        <Dialog open onOpenChange={handleClose}>
          <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle asChild>{header}</DialogTitle>
            </DialogHeader>
            <LeadDetailContent
              lead={lead}
              isFullscreen
              isEditing={isEditing}
              onStartEdit={() => setIsEditing(true)}
              onStopEdit={() => setIsEditing(false)}
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Sheet open={!!lead} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle asChild>{header}</SheetTitle>
        </SheetHeader>
        <LeadDetailContent
          lead={lead}
          isFullscreen={false}
          isEditing={isEditing}
          onStartEdit={() => setIsEditing(true)}
          onStopEdit={() => setIsEditing(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
