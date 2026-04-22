import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bot, Pencil, Save, History, Play, Loader2, Wand2, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { AgentBuilderWizard } from "./AgentBuilderWizard";

type Agent = {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  tipo: string;
  system_prompt: string;
  modelo: string;
  max_tokens: number;
  temperature: number;
  ativo: boolean;
  versao: number;
  updated_at: string;
};

const MODELOS = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (rápido, padrão)" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite (econômico)" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (raciocínio profundo)" },
  { value: "openai/gpt-5", label: "GPT-5 (premium)" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano (mais barato)" },
];

const TIPO_COLORS: Record<string, string> = {
  front_line: "bg-primary/10 text-primary border-primary/30",
  meta: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  junior: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
};

export function AgentsConfigTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [testing, setTesting] = useState<Agent | null>(null);
  const [wizardSlug, setWizardSlug] = useState<string | null | undefined>(undefined);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("agents_config").select("*").order("tipo").order("nome");
    if (error) toast.error("Erro ao carregar agents");
    setAgents((data as Agent[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (a: Agent) => {
    await supabase.from("agents_config").update({ ativo: !a.ativo }).eq("id", a.id);
    toast.success(`Agent ${!a.ativo ? "ativado" : "desativado"}`);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setWizardSlug(null)} className="bg-gradient-to-r from-primary to-blue-500 btn-press">
          <Plus className="h-4 w-4 mr-1" /> Novo Agent (Builder)
        </Button>
      </div>
      {agents.map((a, i) => (
        <motion.div
          key={a.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
        >
          <Card className="hover-card-lift border-border/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-blue-400/10 flex items-center justify-center shrink-0">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm">{a.nome}</h3>
                  <Badge variant="outline" className={`text-[10px] ${TIPO_COLORS[a.tipo] || ""}`}>{a.tipo}</Badge>
                  <Badge variant="outline" className="text-[10px]">v{a.versao}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.descricao}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-1 font-mono truncate">{a.modelo} · {a.slug}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={a.ativo} onCheckedChange={() => toggleActive(a)} />
                <Button variant="outline" size="sm" onClick={() => setTesting(a)} className="btn-press">
                  <Play className="h-3.5 w-3.5 mr-1" /> Testar
                </Button>
                <Button variant="outline" size="sm" onClick={() => setWizardSlug(a.slug)} className="btn-press">
                  <Wand2 className="h-3.5 w-3.5 mr-1" /> Builder
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(a)} className="btn-press">
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}

      {editing && <AgentEditDialog agent={editing} onClose={() => { setEditing(null); load(); }} />}
      {testing && <AgentTestDialog agent={testing} onClose={() => setTesting(null)} />}
      <AgentBuilderWizard
        open={wizardSlug !== undefined}
        agentSlug={wizardSlug}
        onClose={(saved) => { setWizardSlug(undefined); if (saved) load(); }}
      />
    </div>
  );
}

function AgentEditDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [form, setForm] = useState({
    nome: agent.nome,
    descricao: agent.descricao || "",
    system_prompt: agent.system_prompt,
    modelo: agent.modelo,
    max_tokens: agent.max_tokens,
    temperature: agent.temperature,
  });
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const save = async () => {
    setSaving(true);
    const promptChanged = form.system_prompt !== agent.system_prompt || form.modelo !== agent.modelo;
    const newVersion = promptChanged ? agent.versao + 1 : agent.versao;

    if (promptChanged) {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("agents_config_history").insert({
        agent_slug: agent.slug,
        versao: agent.versao,
        system_prompt: agent.system_prompt,
        modelo: agent.modelo,
        motivo_mudanca: motivo || "atualização manual",
        criado_por: user?.id ?? null,
      });
    }

    const { error } = await supabase
      .from("agents_config")
      .update({ ...form, versao: newVersion })
      .eq("id", agent.id);

    setSaving(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success(promptChanged ? `Salvo como versão ${newVersion}` : "Salvo");
    onClose();
  };

  const loadHistory = async () => {
    const { data } = await supabase
      .from("agents_config_history")
      .select("*")
      .eq("agent_slug", agent.slug)
      .order("versao", { ascending: false });
    setHistory(data || []);
    setShowHistory(true);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" /> Editar {agent.nome}
          </DialogTitle>
          <DialogDescription>Mudanças no prompt ou modelo criam uma nova versão automaticamente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
            <div>
              <Label>Modelo</Label>
              <Select value={form.modelo} onValueChange={(v) => setForm((f) => ({ ...f, modelo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODELOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Max tokens</Label>
              <Input type="number" value={form.max_tokens} onChange={(e) => setForm((f) => ({ ...f, max_tokens: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <Label>Temperature ({form.temperature})</Label>
              <Input type="number" step="0.1" min="0" max="2" value={form.temperature} onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
          <div>
            <Label>System Prompt</Label>
            <Textarea
              value={form.system_prompt}
              onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
              rows={14}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label>Motivo da mudança (opcional)</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex: tom mais leve, removeu jargão técnico..." />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={loadHistory} className="btn-press">
            <History className="h-3.5 w-3.5 mr-1" /> Versões
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="btn-press bg-gradient-to-r from-primary to-blue-500">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Salvar</>}
          </Button>
        </DialogFooter>

        {showHistory && (
          <div className="border-t pt-3 mt-3 space-y-2 max-h-64 overflow-y-auto">
            <h4 className="text-sm font-semibold">Histórico de versões</h4>
            {history.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma versão anterior</p>}
            {history.map((h) => (
              <div key={h.id} className="text-xs p-2 rounded border border-border/50 bg-muted/30">
                <div className="flex justify-between font-medium">
                  <span>v{h.versao} · {h.modelo}</span>
                  <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString("pt-BR")}</span>
                </div>
                {h.motivo_mudanca && <p className="text-muted-foreground mt-1">{h.motivo_mudanca}</p>}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AgentTestDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokens, setTokens] = useState<{ in: number; out: number } | null>(null);

  const run = async () => {
    if (!input.trim()) return;
    setLoading(true); setOutput(""); setTokens(null);
    const { data, error } = await supabase.functions.invoke("agent-call", {
      body: { agent_slug: agent.slug, user_message: input },
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    if (data?.error) { toast.error(data.error); return; }
    setOutput(data?.response || "");
    setTokens(data?.tokens || null);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Testar {agent.nome}</DialogTitle>
          <DialogDescription>Esta conversa não é salva — é só pra você experimentar o prompt.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Mensagem do cliente</Label>
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3} placeholder="Oi, vi seu anúncio..." />
          </div>
          <Button onClick={run} disabled={loading || !input.trim()} className="btn-press">
            {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Pensando...</> : <><Play className="h-4 w-4 mr-1" /> Enviar</>}
          </Button>
          {output && (
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
              <p className="text-sm whitespace-pre-wrap">{output}</p>
              {tokens && <p className="text-[11px] text-muted-foreground font-mono">↓ {tokens.in} in · ↑ {tokens.out} out</p>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
