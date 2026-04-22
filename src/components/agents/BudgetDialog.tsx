import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Budget } from "@/hooks/useAgentCosts";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agentSlug: string;
  agentName: string;
  initial?: Budget;
  onSave: (b: Partial<Budget> & { agent_slug: string }) => Promise<void>;
};

export function BudgetDialog({ open, onOpenChange, agentSlug, agentName, initial, onSave }: Props) {
  const [daily, setDaily] = useState(5);
  const [monthly, setMonthly] = useState(100);
  const [warnAt, setWarnAt] = useState(80);
  const [pause, setPause] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setDaily(Number(initial.daily_limit_usd));
      setMonthly(Number(initial.monthly_limit_usd));
      setWarnAt(initial.warn_at_pct);
      setPause(initial.pause_on_exceed);
    } else { setDaily(5); setMonthly(100); setWarnAt(80); setPause(false); }
  }, [initial, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        agent_slug: agentSlug,
        daily_limit_usd: daily,
        monthly_limit_usd: monthly,
        warn_at_pct: warnAt,
        pause_on_exceed: pause,
        ativo: true,
      });
      toast.success("Orçamento atualizado");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Orçamento — {agentName}</DialogTitle>
          <DialogDescription>Defina limites de gasto e quando avisar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Limite diário (USD)</Label>
              <Input type="number" step="0.5" value={daily} onChange={(e) => setDaily(Number(e.target.value))} />
            </div>
            <div>
              <Label>Limite mensal (USD)</Label>
              <Input type="number" step="1" value={monthly} onChange={(e) => setMonthly(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <Label>Avisar em (% do limite)</Label>
            <Input type="number" min={1} max={100} value={warnAt} onChange={(e) => setWarnAt(Number(e.target.value))} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Pausar agent ao exceder</p>
              <p className="text-xs text-muted-foreground">Desativa automaticamente quando atingir 100%</p>
            </div>
            <Switch checked={pause} onCheckedChange={setPause} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}