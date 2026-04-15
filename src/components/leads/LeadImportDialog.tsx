import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";

const CRM_FIELDS = [
  { key: "name", label: "Nome", required: true },
  { key: "phone", label: "Telefone", required: true },
  { key: "email", label: "Email", required: false },
  { key: "type", label: "Tipo (PF/PJ/PME)", required: false },
  { key: "stage", label: "Estágio", required: false },
  { key: "operator", label: "Operadora", required: false },
  { key: "lives", label: "Vidas", required: false },
  { key: "notes", label: "Observações", required: false },
  { key: "__skip", label: "— Ignorar —", required: false },
];

interface ImportRow {
  [key: string]: string;
}

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface LeadImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function LeadImportDialog({ open, onOpenChange, onImported }: LeadImportDialogProps) {
  const { user } = useAuth();
  const { leads } = useLeadsContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "map" | "preview" | "importing" | "done">("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [imported, setImported] = useState(0);
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "overwrite">("skip");

  const reset = () => {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setErrors([]);
    setImported(0);
  };

  const parseCSV = (text: string): { headers: string[]; rows: ImportRow[] } => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    const h = lines[0].split(/[,;]/).map(c => c.replace(/^"|"$/g, "").trim());
    const r = lines.slice(1).map(line => {
      const cols = line.split(/[,;]/).map(c => c.replace(/^"|"$/g, "").trim());
      const obj: ImportRow = {};
      h.forEach((header, i) => { obj[header] = cols[i] || ""; });
      return obj;
    });
    return { headers: h, rows: r };
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
      const text = await file.text();
      const { headers: h, rows: r } = parseCSV(text);
      setHeaders(h);
      setRows(r);

      // Auto-map by name similarity
      const autoMap: Record<string, string> = {};
      h.forEach(header => {
        const lower = header.toLowerCase();
        if (lower.includes("nome") || lower === "name") autoMap[header] = "name";
        else if (lower.includes("telefone") || lower.includes("phone") || lower.includes("celular")) autoMap[header] = "phone";
        else if (lower.includes("email") || lower.includes("e-mail")) autoMap[header] = "email";
        else if (lower.includes("tipo") || lower === "type") autoMap[header] = "type";
        else if (lower.includes("operadora")) autoMap[header] = "operator";
        else if (lower.includes("vidas") || lower === "lives") autoMap[header] = "lives";
        else autoMap[header] = "__skip";
      });
      setMapping(autoMap);
      setStep("map");
    } else {
      toast.error("Formato não suportado. Use CSV.");
    }
  };

  const validate = useCallback((): ValidationError[] => {
    const errs: ValidationError[] = [];
    const phoneField = Object.entries(mapping).find(([, v]) => v === "phone")?.[0];
    const nameField = Object.entries(mapping).find(([, v]) => v === "name")?.[0];

    if (!phoneField) { errs.push({ row: 0, field: "phone", message: "Mapeie uma coluna para Telefone" }); return errs; }
    if (!nameField) { errs.push({ row: 0, field: "name", message: "Mapeie uma coluna para Nome" }); return errs; }

    rows.forEach((row, i) => {
      const phone = row[phoneField]?.replace(/\D/g, "");
      if (!phone || phone.length < 10) {
        errs.push({ row: i + 2, field: "phone", message: `Telefone inválido: "${row[phoneField]}"` });
      }
      if (!row[nameField]?.trim()) {
        errs.push({ row: i + 2, field: "name", message: "Nome vazio" });
      }
      const typeField = Object.entries(mapping).find(([, v]) => v === "type")?.[0];
      if (typeField && row[typeField]) {
        const t = row[typeField].toUpperCase();
        if (!["PF", "PJ", "PME"].includes(t)) {
          errs.push({ row: i + 2, field: "type", message: `Tipo inválido: "${row[typeField]}"` });
        }
      }
    });
    return errs;
  }, [rows, mapping]);

  const goToPreview = () => {
    const errs = validate();
    setErrors(errs);
    setStep("preview");
  };

  const doImport = async () => {
    if (!user) return;
    setStep("importing");
    const existingPhones = new Set(leads.map(l => l.phone.replace(/\D/g, "")));

    let count = 0;
    const validRows = rows.filter((_, i) => !errors.some(e => e.row === i + 2));

    for (const row of validRows) {
      const mapped: Record<string, string | number | null> = {};
      for (const [header, field] of Object.entries(mapping)) {
        if (field === "__skip") continue;
        mapped[field] = row[header] || null;
      }

      let phone = (mapped.phone as string)?.replace(/\D/g, "") || "";
      if (!phone.startsWith("55")) phone = `55${phone}`;

      if (existingPhones.has(phone) || existingPhones.has(phone.slice(2))) {
        if (duplicateAction === "skip") continue;
        // overwrite: update existing
        const existing = leads.find(l => l.phone.replace(/\D/g, "") === phone || l.phone.replace(/\D/g, "") === phone.slice(2));
        if (existing) {
          await supabase.from("leads").update({
            name: (mapped.name as string) || existing.name,
            email: (mapped.email as string) || undefined,
            type: ((mapped.type as string)?.toUpperCase() as "PF" | "PJ" | "PME") || undefined,
            operator: (mapped.operator as string) || undefined,
            lives: mapped.lives ? parseInt(mapped.lives as string) : undefined,
            notes: (mapped.notes as string) || undefined,
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
          count++;
          continue;
        }
      }

      const { error } = await supabase.from("leads").insert({
        user_id: user.id,
        name: (mapped.name as string) || "Sem nome",
        phone,
        email: (mapped.email as string) || null,
        type: ((mapped.type as string)?.toUpperCase() as "PF" | "PJ" | "PME") || "PF",
        stage: "novo",
        operator: (mapped.operator as string) || null,
        lives: mapped.lives ? parseInt(mapped.lives as string) : null,
        notes: (mapped.notes as string) || null,
      });
      if (!error) {
        count++;
        existingPhones.add(phone);
      }
    }

    setImported(count);
    setStep("done");
    onImported();
    toast.success(`${count} leads importados com sucesso`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Importar Leads
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-4">
            <div
              className="border-2 border-dashed border-border rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Clique ou arraste um arquivo CSV</p>
              <p className="text-xs text-muted-foreground mt-1">Formato suportado: .csv</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{rows.length} linhas encontradas. Mapeie as colunas:</p>
            <div className="space-y-2">
              {headers.map(header => (
                <div key={header} className="flex items-center gap-3">
                  <span className="text-sm w-40 truncate font-mono">{header}</span>
                  <span className="text-muted-foreground">→</span>
                  <Select value={mapping[header] || "__skip"} onValueChange={v => setMapping(m => ({ ...m, [header]: v }))}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CRM_FIELDS.map(f => (
                        <SelectItem key={f.key} value={f.key}>
                          {f.label} {f.required && "*"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm">Duplicatas:</span>
              <Select value={duplicateAction} onValueChange={v => setDuplicateAction(v as "skip" | "overwrite")}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Pular</SelectItem>
                  <SelectItem value="overwrite">Sobrescrever</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={reset}>Voltar</Button>
              <Button onClick={goToPreview}>Validar e Pré-visualizar</Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            {errors.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> {errors.length} erros encontrados
                </p>
                <ul className="text-xs text-destructive/80 mt-1 space-y-0.5 max-h-24 overflow-y-auto">
                  {errors.slice(0, 10).map((e, i) => (
                    <li key={i}>Linha {e.row}: {e.message}</li>
                  ))}
                  {errors.length > 10 && <li>...e mais {errors.length - 10} erros</li>}
                </ul>
              </div>
            )}
            <p className="text-sm">{rows.length - errors.length} leads válidos para importação</p>
            <Table>
              <TableHeader>
                <TableRow>
                  {Object.entries(mapping).filter(([, v]) => v !== "__skip").map(([h, v]) => (
                    <TableHead key={h}>{CRM_FIELDS.find(f => f.key === v)?.label || v}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 5).map((row, i) => (
                  <TableRow key={i} className={errors.some(e => e.row === i + 2) ? "bg-destructive/5" : ""}>
                    {Object.entries(mapping).filter(([, v]) => v !== "__skip").map(([h]) => (
                      <TableCell key={h} className="text-xs">{row[h]}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 5 && <p className="text-xs text-muted-foreground">...e mais {rows.length - 5} linhas</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep("map")}>Voltar</Button>
              <Button onClick={doImport} disabled={rows.length - errors.length === 0}>
                Importar {rows.length - errors.length} leads
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center py-12 gap-3">
            <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Importando leads...</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center py-12 gap-3">
            <CheckCircle2 className="h-12 w-12 text-primary" />
            <p className="text-lg font-semibold">{imported} leads importados</p>
            <Button onClick={() => { reset(); onOpenChange(false); }}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
