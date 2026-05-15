import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Send, RotateCcw, Bot, User as UserIcon, Sparkles, Phone, RefreshCcw, CheckCircle2, Circle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { normalizePhone } from "@/lib/phone";
import { QUALIFICATION_FIELDS } from "@/lib/agents/juniorPrequalificador";

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

type Agent = {
  id: string;
  slug: string;
  nome: string;
  tipo: string;
  ativo: boolean;
};

type QualState = Record<string, string | null>;

export function AgentsPlaygroundTab() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [phone, setPhone] = useState("5511999999999");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [qualState, setQualState] = useState<QualState>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("agents_config")
        .select("id, slug, nome, tipo, ativo")
        .order("nome");
      const list = (data as Agent[]) || [];
      setAgents(list);
      if (list.length && !selectedAgent) {
        const prequalificador = list.find(a => a.slug.includes("prequalificador") || a.slug.includes("junior"));
        setSelectedAgent(prequalificador?.slug || list[0].slug);
      }
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  const currentAgent = agents.find(a => a.slug === selectedAgent);

  const ensureLead = async (): Promise<string | null> => {
    const norm = normalizePhone(phone);
    if (!norm) {
      toast.error("Telefone inválido");
      return null;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Faça login");
      return null;
    }

    const { data: existing } = await supabase
      .from("leads")
      .select("id, stage, in_manual_conversation")
      .eq("user_id", user.id)
      .eq("phone", norm)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      if (existing.in_manual_conversation || !["novo", "tentativa_contato", "contato_realizado"].includes(existing.stage)) {
        await supabase.from("leads").update({
          stage: "novo",
          in_manual_conversation: false,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      }
      return existing.id;
    }

    const { data: created, error } = await supabase.from("leads").insert({
      user_id: user.id,
      name: `Teste ${currentAgent?.nome || "Agent"} ${norm.slice(-4)}`,
      phone: norm,
      type: "PF",
      stage: "novo",
    }).select("id").single();
    if (error) {
      toast.error("Erro ao criar lead: " + error.message);
      return null;
    }
    return created.id;
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !selectedAgent) return;

    setSending(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text, ts: Date.now() }]);

    let lid = leadId;
    if (!lid) {
      setBootstrapping(true);
      lid = await ensureLead();
      setBootstrapping(false);
      if (!lid) { setSending(false); return; }
      setLeadId(lid);
    }

    setTyping(true);
    try {
      const { data, error } = await supabase.functions.invoke("junior-sdr", {
        body: {
          lead_id: lid,
          whatsapp_number: normalizePhone(phone) || phone,
          user_message: text,
          conversation_id: conversationId,
          agent_slug: selectedAgent,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Erro desconhecido");

      if (data.conversation_id && !conversationId) setConversationId(data.conversation_id);

      if (data.qual_state) {
        setQualState(data.qual_state);
      }

      const baloes: string[] = data.mensagens || [];
      const delays: number[] = data.delays_ms || [];

      for (let i = 0; i < baloes.length; i++) {
        const d = Math.min(delays[i] ?? 2000, 4000);
        await new Promise((r) => setTimeout(r, d));
        setMessages((m) => [...m, { role: "assistant", content: baloes[i], ts: Date.now() }]);
      }

      if (data.qualificou) {
        toast.success("Lead qualificado!", {
          description: "Em produção, seria transferido pro humano.",
        });
      }
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || String(err)));
    } finally {
      setTyping(false);
      setSending(false);
    }
  };

  const reset = async () => {
    if (conversationId) {
      await supabase
        .from("agent_conversations")
        .update({ status: "encerrada", encerrada_em: new Date().toISOString() })
        .eq("id", conversationId);
    }
    setConversationId(null);
    setMessages([]);
    setInput("");
    setQualState({});
    toast.success("Conversa resetada");
  };

  const resetLead = async () => {
    if (!leadId) {
      toast.info("Nenhum lead carregado ainda");
      return;
    }
    await supabase.from("leads").update({
      stage: "novo",
      in_manual_conversation: false,
      updated_at: new Date().toISOString(),
    }).eq("id", leadId);
    await reset();
    toast.success("Lead resetado pra stage='novo'");
  };

  const filledFields = Object.values(qualState).filter(Boolean).length;
  const totalRequired = QUALIFICATION_FIELDS.filter(f => f.required).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      {/* Painel lateral */}
      <div className="space-y-4">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" /> Configuração
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Agente</Label>
              <Select value={selectedAgent} onValueChange={(v) => { setSelectedAgent(v); reset(); }}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Selecione um agente" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.slug} value={a.slug}>
                      <span className="flex items-center gap-2">
                        <Bot className="h-3 w-3" />
                        {a.nome}
                        <Badge variant="outline" className="text-[9px] ml-1">{a.tipo}</Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Telefone simulado</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5511999999999"
                disabled={messages.length > 0}
                className="font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {leadId ? `Lead: ${leadId.slice(0, 8)}…` : "Lead criado no 1º envio"}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
              <Button variant="outline" size="sm" onClick={reset} disabled={messages.length === 0} className="btn-press w-full">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Resetar conversa
              </Button>
              <Button variant="outline" size="sm" onClick={resetLead} disabled={!leadId} className="btn-press w-full">
                <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Resetar lead
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Estado de qualificação */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Qualificação</span>
              <Badge variant={filledFields >= totalRequired ? "default" : "secondary"} className="text-[10px]">
                {filledFields}/{QUALIFICATION_FIELDS.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {QUALIFICATION_FIELDS.map((f) => {
              const value = qualState[f.key];
              return (
                <div key={f.key} className="flex items-center gap-2 text-xs">
                  {value ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                  )}
                  <span className={value ? "text-foreground" : "text-muted-foreground"}>
                    {f.label}
                    {f.required && !value && <span className="text-destructive/60 ml-0.5">*</span>}
                  </span>
                  {value && (
                    <span className="ml-auto text-[10px] text-muted-foreground truncate max-w-[100px]">{value}</span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-muted/30">
          <CardContent className="p-4 space-y-2 text-xs text-muted-foreground">
            <p className="flex items-start gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <span><b>Dica:</b> teste cenários reais — "Oi vi seu anúncio", "Quanto custa?", "Sou MEI 3 vidas".</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Área de chat */}
      <Card className="border-border/50 flex flex-col h-[70vh]">
        <CardHeader className="pb-3 border-b border-border/50">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {currentAgent?.nome || "Selecione um agente"}
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                  Playground
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground font-normal">Conversa de teste — não envia WhatsApp</p>
            </div>
          </CardTitle>
        </CardHeader>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-center text-sm text-muted-foreground">
              <div>
                <Bot className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>Comece digitando como se fosse um cliente chegando pelo WhatsApp.</p>
                <p className="text-xs mt-1 opacity-70">Ex: "Oi, vi o anúncio do plano de saúde"</p>
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={`${m.ts}-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shrink-0">
                    <Bot className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-card border border-border/60 rounded-tl-sm"
                  }`}
                >
                  {m.content}
                </div>
                {m.role === "user" && (
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {typing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2 justify-start">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary to-blue-400 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <div className="bg-card border border-border/60 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </motion.div>
          )}
        </div>

        <div className="p-3 border-t border-border/50 bg-card">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Digite como se fosse o cliente... (Enter envia)"
              rows={2}
              disabled={sending || !selectedAgent}
              className="resize-none text-sm"
            />
            <Button onClick={send} disabled={sending || !input.trim() || !selectedAgent} className="btn-press self-end bg-gradient-to-r from-primary to-blue-500">
              {sending || bootstrapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
