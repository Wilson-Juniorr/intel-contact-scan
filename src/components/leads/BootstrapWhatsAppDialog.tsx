import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Users, Link, Plus, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

interface Stats {
  totalContacts: number;
  withLeadId: number;
  toCreate: number;
}

export function BootstrapWhatsAppDialog({ open, onOpenChange, onComplete }: Props) {
  const { session } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const fetchStats = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bootstrap-whatsapp-leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ dryRun: true }),
      });
      if (!resp.ok) throw new Error("Erro ao buscar dados");
      const data = await resp.json();
      setStats(data);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const execute = async () => {
    if (!session) return;
    setExecuting(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bootstrap-whatsapp-leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ dryRun: false }),
      });
      if (!resp.ok) throw new Error("Erro ao executar bootstrap");
      const data = await resp.json();
      setResult(data);
      toast({ title: `${data.created} negócios criados com sucesso!` });
      onComplete();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setExecuting(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (v && !stats && !loading) fetchStats();
    if (!v) { setStats(null); setResult(null); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Criar Negócios do WhatsApp
          </DialogTitle>
          <DialogDescription>
            Cria um negócio no funil para cada contato do WhatsApp que ainda não tem lead vinculado.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : result ? (
          <div className="space-y-3 py-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat icon={<Plus className="h-4 w-4 text-primary" />} label="Criados" value={result.created} />
              <Stat icon={<Link className="h-4 w-4 text-secondary" />} label="Vinculados" value={result.linked} />
              <Stat icon={<Users className="h-4 w-4 text-muted-foreground" />} label="Já tinham lead" value={result.alreadyLinked} />
              {result.skipped > 0 && <Stat icon={<Users className="h-4 w-4 text-destructive" />} label="Ignorados" value={result.skipped} />}
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Todos os negócios foram criados e vinculados. Recarregue o funil para visualizar.
            </p>
          </div>
        ) : stats ? (
          <div className="space-y-3 py-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat icon={<Users className="h-4 w-4 text-primary" />} label="Total contatos" value={stats.totalContacts} />
              <Stat icon={<Link className="h-4 w-4 text-secondary" />} label="Com lead" value={stats.withLeadId} />
              <Stat icon={<Plus className="h-4 w-4 text-accent-foreground" />} label="A criar" value={stats.toCreate} />
            </div>
            {stats.toCreate === 0 && (
              <p className="text-xs text-muted-foreground text-center">Todos os contatos já possuem negócio vinculado.</p>
            )}
          </div>
        ) : null}

        <DialogFooter>
          {!result && stats && stats.toCreate > 0 && (
            <Button onClick={execute} disabled={executing} className="gap-2">
              {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {executing ? "Criando..." : `Criar ${stats.toCreate} negócios`}
            </Button>
          )}
          {result && (
            <Button onClick={() => handleOpenChange(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card">
      {icon}
      <div>
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}
