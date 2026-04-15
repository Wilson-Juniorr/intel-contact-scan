import { useState, useRef, useEffect, useCallback } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Camera, Upload, Loader2, Check, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LeadFormDialog({ open, onOpenChange }: Props) {
  const { addLead } = useLeadsContext();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState("PF");
  const [planType, setPlanType] = useState("");
  const [operator, setOperator] = useState("");
  const [lives, setLives] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // OCR state
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResults, setOcrResults] = useState<{ name: string; phone: string }[]>([]);
  const [pastedPreview, setPastedPreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("manual");
  const fileRef = useRef<HTMLInputElement>(null);

  const processImageFile = useCallback(async (file: File) => {
    setOcrLoading(true);
    setOcrResults([]);
    setPastedPreview(null);

    const preview = URL.createObjectURL(file);
    setPastedPreview(preview);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const { data, error } = await supabase.functions.invoke("ocr-extract", {
          body: { imageBase64: base64 },
        });
        if (error) throw error;
        const contacts = data?.contacts || [];
        if (contacts.length === 0) {
          toast({ title: "Nenhum contato encontrado", description: "Tente com outra imagem", variant: "destructive" });
        } else {
          setOcrResults(contacts);
          if (contacts[0]) {
            setName(contacts[0].name || "");
            setPhone(contacts[0].phone || "");
          }
          toast({ title: `${contacts.length} contato(s) encontrado(s)!` });
        }
        setOcrLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (e: any) {
      toast({ title: "Erro no OCR", description: e.message, variant: "destructive" });
      setOcrLoading(false);
    }
  }, []);

  // Global paste handler when dialog is open and on image tab
  useEffect(() => {
    if (!open || activeTab !== "image") return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) processImageFile(file);
          return;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [open, activeTab, processImageFile]);

  const reset = () => {
    setName(""); setPhone(""); setEmail(""); setType("PF");
    setPlanType(""); setOperator(""); setLives(""); setNotes("");
    setOcrResults([]); setPastedPreview(null);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) {
      toast({ title: "Preencha nome e telefone", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await addLead({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        type,
        plan_type: planType || undefined,
        operator: operator.trim() || undefined,
        lives: lives ? parseInt(lives) : undefined,
        notes: notes.trim() || undefined,
        stage: "novo",
      });
      toast({ title: "Lead cadastrado com sucesso!" });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
  };

  const selectOcrContact = (contact: { name: string; phone: string }) => {
    setName(contact.name);
    setPhone(contact.phone);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Lead</DialogTitle>
          <DialogDescription>Cadastre um novo lead manualmente ou por imagem.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="manual" value={activeTab} onValueChange={setActiveTab}>
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
                <Select value={type} onValueChange={setType}>
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
                <Select value={planType} onValueChange={setPlanType}>
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
            <Button onClick={handleSubmit} disabled={saving} className="w-full">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</> : "Cadastrar Lead"}
            </Button>
          </TabsContent>

          <TabsContent value="image" className="mt-4 space-y-4">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              {ocrLoading ? (
                <div className="space-y-3">
                  <Loader2 className="h-10 w-10 mx-auto text-primary animate-spin" />
                  <p className="text-sm font-medium">Analisando imagem com IA...</p>
                </div>
              ) : pastedPreview ? (
                <img src={pastedPreview} alt="Preview" className="max-h-32 mx-auto rounded-lg object-contain" />
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Envie uma imagem com nome e número</p>
                  <p className="text-xs text-muted-foreground mt-1">Print de WhatsApp, lista de contatos, cartão...</p>
                  <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-primary font-medium">
                    <ClipboardPaste className="h-3.5 w-3.5" />
                    Ou pressione Ctrl+V para colar da área de transferência
                  </div>
                </>
              )}
            </div>

            {ocrResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Contatos encontrados:</p>
                {ocrResults.map((c, i) => (
                  <div
                    key={i}
                    onClick={() => selectOcrContact(c)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      name === c.name && phone === c.phone
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                      </div>
                      {name === c.name && phone === c.phone && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(name || phone) && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nome</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </div>
                <Button onClick={handleSubmit} disabled={saving} className="w-full">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</> : "Cadastrar Lead"}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
