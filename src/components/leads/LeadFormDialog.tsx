import { useState } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { LeadType, PlanType, FunnelStage } from "@/types/lead";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Camera, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadFormDialog({ open, onOpenChange }: Props) {
  const { addLead } = useLeadsContext();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<LeadType>("PF");
  const [planType, setPlanType] = useState<PlanType | "">("");
  const [operator, setOperator] = useState("");
  const [lives, setLives] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setName(""); setPhone(""); setEmail(""); setType("PF");
    setPlanType(""); setOperator(""); setLives(""); setNotes("");
  };

  const handleSubmit = () => {
    if (!name.trim() || !phone.trim()) {
      toast({ title: "Preencha nome e telefone", variant: "destructive" });
      return;
    }
    addLead({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      type,
      plan_type: planType as PlanType || undefined,
      operator: operator.trim() || undefined,
      lives: lives ? parseInt(lives) : undefined,
      notes: notes.trim() || undefined,
      stage: "novo" as FunnelStage,
    });
    toast({ title: "Lead cadastrado com sucesso!" });
    reset();
    onOpenChange(false);
  };

  const handleImageUpload = () => {
    toast({
      title: "OCR via IA",
      description: "Esta funcionalidade será ativada com o Lovable Cloud. A IA extrairá nome e telefone da imagem automaticamente.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Lead</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="manual">
          <TabsList className="w-full">
            <TabsTrigger value="manual" className="flex-1">Cadastro Manual</TabsTrigger>
            <TabsTrigger value="image" className="flex-1 gap-2">
              <Camera className="h-4 w-4" /> Por Imagem (IA)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do lead" />
              </div>
              <div>
                <Label>Telefone *</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="11999887766" />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" type="email" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={type} onValueChange={(v) => setType(v as LeadType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                    <SelectItem value="PME">PME</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de Plano</Label>
                <Select value={planType} onValueChange={(v) => setPlanType(v as PlanType)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Individual">Individual</SelectItem>
                    <SelectItem value="Familiar">Familiar</SelectItem>
                    <SelectItem value="Empresarial">Empresarial</SelectItem>
                    <SelectItem value="PME">PME</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Operadora</Label>
                <Input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Ex: Unimed, Amil..." />
              </div>
              <div>
                <Label>Qtd. Vidas</Label>
                <Input value={lives} onChange={(e) => setLives(e.target.value)} placeholder="1" type="number" min="1" />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas sobre o lead..." rows={3} />
            </div>
            <Button onClick={handleSubmit} className="w-full">Cadastrar Lead</Button>
          </TabsContent>

          <TabsContent value="image" className="mt-4">
            <div
              onClick={handleImageUpload}
              className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Envie uma imagem com nome e número</p>
              <p className="text-xs text-muted-foreground mt-1">
                Print de WhatsApp, lista de contatos, cartão de visita...
              </p>
              <p className="text-xs text-primary mt-3">
                A IA extrairá os dados automaticamente
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
