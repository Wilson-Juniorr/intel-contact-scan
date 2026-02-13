import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface QuoteData {
  min_value: number | null;
  operadora: string | null;
  plan_name: string | null;
  confidence: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quoteData: QuoteData | null;
  loading?: boolean;
  /** "quote" = confirming a quote, "approved" = entering approved value */
  mode: "quote" | "approved";
  onConfirm: (data: { min_value?: number; operadora?: string; plan_name?: string; approved_value?: number }) => void;
}

export function QuoteConfirmDialog({ open, onOpenChange, quoteData, loading, mode, onConfirm }: Props) {
  const [minValue, setMinValue] = useState("");
  const [operadora, setOperadora] = useState("");
  const [planName, setPlanName] = useState("");
  const [approvedValue, setApprovedValue] = useState("");

  useEffect(() => {
    if (quoteData && mode === "quote") {
      setMinValue(quoteData.min_value?.toString() || "");
      setOperadora(quoteData.operadora || "");
      setPlanName(quoteData.plan_name || "");
    }
  }, [quoteData, mode]);

  const isLowConfidence = !quoteData || (quoteData.confidence < 0.5);

  const handleSubmit = () => {
    if (mode === "approved") {
      const val = parseFloat(approvedValue);
      if (!val || val <= 0) return;
      onConfirm({ approved_value: val });
    } else {
      const val = parseFloat(minValue);
      onConfirm({
        min_value: val > 0 ? val : undefined,
        operadora: operadora || undefined,
        plan_name: planName || undefined,
      });
    }
  };

  if (mode === "approved") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Valor Aprovado Obrigatório
            </DialogTitle>
            <DialogDescription>
              Para avançar para esta etapa, informe o valor aprovado pelo cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-medium">Valor aprovado (R$/mês) *</Label>
              <Input
                type="number" step="0.01" min="0"
                placeholder="Ex: 450.00"
                value={approvedValue}
                onChange={(e) => setApprovedValue(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!approvedValue || parseFloat(approvedValue) <= 0}>
              Confirmar e Avançar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : isLowConfidence ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            )}
            {loading ? "Extraindo dados da cotação..." : "Confirmar Cotação"}
          </DialogTitle>
          <DialogDescription>
            {loading
              ? "Analisando o documento para extrair valores automaticamente..."
              : isLowConfidence
                ? "Não foi possível detectar o valor automaticamente. Preencha manualmente."
                : "Verifique os dados extraídos e confirme."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-medium">Menor valor mensal (R$) *</Label>
              <Input
                type="number" step="0.01" min="0"
                placeholder="Ex: 299.90"
                value={minValue}
                onChange={(e) => setMinValue(e.target.value)}
                autoFocus={isLowConfidence}
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Operadora</Label>
              <Input
                placeholder="Ex: Amil, Bradesco..."
                value={operadora}
                onChange={(e) => setOperadora(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs font-medium">Nome do plano</Label>
              <Input
                placeholder="Ex: Amil 400"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
              />
            </div>
            {quoteData && quoteData.confidence > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Confiança da extração: {Math.round(quoteData.confidence * 100)}%
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading}>
            Confirmar Cotação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
