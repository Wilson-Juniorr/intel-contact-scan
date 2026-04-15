import { useState, useRef, useEffect } from "react";
import { Lead } from "@/types/lead";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, FileText, Send, User, Phone, Mail, Users, Building2 } from "lucide-react";
import { cleanPhone } from "@/lib/phone";

export interface EmissionFormData {
  vigencia: string;
  nomePlano: string;
  nomeTitular: string;
  emailTitular: string;
  celularTitular: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
  documentsCount: number;
  onConfirm: (data: EmissionFormData) => void;
  isLoading?: boolean;
}

const EMAIL_DOMAINS = [
  "@gmail.com",
  "@outlook.com",
  "@hotmail.com",
  "@yahoo.com.br",
  "@icloud.com",
];

function formatPhone(value: string): string {
  const digits = cleanPhone(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function EmissionFormDialog({
  open,
  onOpenChange,
  lead,
  documentsCount,
  onConfirm,
  isLoading,
}: Props) {
  const [vigenciaDate, setVigenciaDate] = useState<Date | undefined>(undefined);
  const [nomePlano, setNomePlano] = useState("");
  const [nomeTitular, setNomeTitular] = useState(lead.name || "");
  const [emailTitular, setEmailTitular] = useState(lead.email || "");
  const [celularTitular, setCelularTitular] = useState(lead.phone || "");
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Reset when dialog opens with new lead
  useEffect(() => {
    if (open) {
      setNomeTitular(lead.name || "");
      setEmailTitular(lead.email || "");
      setCelularTitular(lead.phone ? formatPhone(lead.phone) : "");
      setVigenciaDate(undefined);
      setNomePlano("");
    }
  }, [open, lead]);

  const vigencia = vigenciaDate ? format(vigenciaDate, "dd/MM/yyyy") : "";
  const canSubmit = vigenciaDate && nomePlano.trim() && nomeTitular.trim();

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm({
      vigencia,
      nomePlano: nomePlano.trim(),
      nomeTitular: nomeTitular.trim(),
      emailTitular: emailTitular.trim(),
      celularTitular: celularTitular.trim(),
    });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCelularTitular(formatPhone(e.target.value));
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmailTitular(val);
    setShowEmailSuggestions(val.includes("@") === false && val.length > 0);
  };

  const handleEmailDomain = (domain: string) => {
    const localPart = emailTitular.split("@")[0];
    setEmailTitular(localPart + domain);
    setShowEmailSuggestions(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Preparar Mensagem de Emissão
          </DialogTitle>
        </DialogHeader>

        {/* Lead summary */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Resumo do Lead
          </p>
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
            <Badge variant="outline" className="text-[10px]">
              {lead.type}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              <FileText className="h-2.5 w-2.5 mr-1" />
              {documentsCount} doc(s)
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Form fields */}
        <div className="space-y-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Dados do Titular
          </p>

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
            <Label htmlFor="celular-titular" className="text-xs flex items-center gap-1.5">
              <Phone className="h-3 w-3" />
              Celular do Titular
            </Label>
            <Input
              id="celular-titular"
              placeholder="(11) 99999-9999"
              value={celularTitular}
              onChange={handlePhoneChange}
              className="h-9 text-sm"
              inputMode="tel"
            />
          </div>

          <div className="space-y-2 relative">
            <Label htmlFor="email-titular" className="text-xs flex items-center gap-1.5">
              <Mail className="h-3 w-3" />
              E-mail do Titular
            </Label>
            <Input
              ref={emailRef}
              id="email-titular"
              placeholder="email@exemplo.com"
              value={emailTitular}
              onChange={handleEmailChange}
              onFocus={() => {
                if (!emailTitular.includes("@") && emailTitular.length > 0)
                  setShowEmailSuggestions(true);
              }}
              onBlur={() => setTimeout(() => setShowEmailSuggestions(false), 200)}
              className="h-9 text-sm"
              inputMode="email"
            />
            {showEmailSuggestions && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-md p-1">
                {EMAIL_DOMAINS.map((domain) => (
                  <button
                    key={domain}
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-accent transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleEmailDomain(domain);
                    }}
                  >
                    {emailTitular.split("@")[0]}
                    {domain}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Separator className="my-1" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Informações do Plano
          </p>

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
            <Label className="text-xs flex items-center gap-1.5">
              <CalendarIcon className="h-3 w-3" />
              Vigência Desejada
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full h-9 justify-start text-left text-sm font-normal",
                    !vigenciaDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {vigenciaDate
                    ? format(vigenciaDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                    : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={vigenciaDate}
                  onSelect={setVigenciaDate}
                  initialFocus
                  locale={ptBR}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!canSubmit || isLoading}
            className="gap-1.5"
          >
            <Send className="h-3 w-3" />
            Gerar Mensagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
