import { useState } from "react";
import { Lead } from "@/types/lead";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Calendar, FileText, Send, User, Phone, Mail, Users, Building2 } from "lucide-react";

interface EmissionFormData {
  vigencia: string;
  nomePlano: string;
  nomeTitular: string;
  emailTitular: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
  documentsCount: number;
  onConfirm: (data: EmissionFormData) => void;
  isLoading?: boolean;
}

export function EmissionFormDialog({ open, onOpenChange, lead, documentsCount, onConfirm, isLoading }: Props) {
  const [vigencia, setVigencia] = useState("");
  const [nomePlano, setNomePlano] = useState("");
  const [nomeTitular, setNomeTitular] = useState(lead.name || "");
  const [emailTitular, setEmailTitular] = useState(lead.email || "");

  const canSubmit = vigencia.trim() && nomePlano.trim() && nomeTitular.trim();

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm({ vigencia: vigencia.trim(), nomePlano: nomePlano.trim(), nomeTitular: nomeTitular.trim(), emailTitular: emailTitular.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Preparar Mensagem de Emissão
          </DialogTitle>
        </DialogHeader>

        {/* Lead summary */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resumo do Lead</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <User className="h-3 w-3 text-muted-foreground" />
              <span className="truncate">{lead.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3 text-muted-foreground" />
              <span>{lead.phone}</span>
            </div>
            {lead.email && (
              <div className="flex items-center gap-1.5 col-span-2">
                <Mail className="h-3 w-3 text-muted-foreground" />
                <span className="truncate">{lead.email}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 text-muted-foreground" />
              <span>{lead.operator || "Não definida"}</span>
            </div>
            {lead.lives && (
              <div className="flex items-center gap-1.5">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span>{lead.lives} vida(s)</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{lead.type}</Badge>
            <Badge variant="secondary" className="text-[10px]">
              <FileText className="h-2.5 w-2.5 mr-1" />
              {documentsCount} doc(s)
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Form fields */}
        <div className="space-y-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dados do Titular</p>

          <div className="space-y-2">
            <Label htmlFor="nome-titular" className="text-xs flex items-center gap-1.5">
              <User className="h-3 w-3" />
              Nome do Titular
            </Label>
            <Input
              id="nome-titular"
              placeholder="Nome completo do titular"
              value={nomeTitular}
              onChange={(e) => setNomeTitular(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-titular" className="text-xs flex items-center gap-1.5">
              <Mail className="h-3 w-3" />
              E-mail do Titular
            </Label>
            <Input
              id="email-titular"
              placeholder="email@exemplo.com"
              value={emailTitular}
              onChange={(e) => setEmailTitular(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <Separator className="my-1" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Informações do Plano</p>

          <div className="space-y-2">
            <Label htmlFor="nome-plano" className="text-xs flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              Nome do Plano
            </Label>
            <Input
              id="nome-plano"
              placeholder="Ex: Mais Orto, Enfermaria, Apartamento..."
              value={nomePlano}
              onChange={(e) => setNomePlano(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vigencia" className="text-xs flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Vigência Desejada
            </Label>
            <Input
              id="vigencia"
              placeholder="Ex: 20/02/2025"
              value={vigencia}
              onChange={(e) => setVigencia(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={!canSubmit || isLoading} className="gap-1.5">
            <Send className="h-3 w-3" />
            Gerar Mensagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
