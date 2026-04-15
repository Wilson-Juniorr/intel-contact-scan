import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Send, User, Bell, Mic, MicOff, Paperclip, X, FileText, ArrowRightLeft, Phone, CalendarClock, StickyNote, FileUp, CheckCircle2, Image } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { FollowUpPanel } from "@/components/followup/FollowUpPanel";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { FUNNEL_STAGES } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type ActionBadge = {
  action: string;
  label: string;
  icon: string;
};

const ACTION_BADGE_MAP: Record<string, { label: string; icon: string }> = {
  move_lead_stage: { label: "Lead movido", icon: "move" },
  add_interaction: { label: "Interação registrada", icon: "interaction" },
  create_reminder: { label: "Lembrete criado", icon: "reminder" },
  add_note: { label: "Nota adicionada", icon: "note" },
  assign_document: { label: "Documento atribuído", icon: "document" },
};

type PendingFile = {
  file_name: string; file_path: string; file_type: string; file_size: number;
  previewUrl?: string;
};

interface Message {
  role: "user" | "assistant";
  content: string;
  fileInfo?: { file_name: string }[];
  actionBadges?: ActionBadge[];
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export default function AssistantPage() {
  const { leads, interactions } = useLeadsContext();
  const { user, session } = useAuth();
  const queryClient = useQueryClient();

  // CRM data queries for context
  const notesQuery = useQuery({
    queryKey: ["lead_notes", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("lead_notes").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const docsQuery = useQuery({
    queryKey: ["lead_documents", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("lead_documents").select("*").order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });

  const checklistQuery = useQuery({
    queryKey: ["lead_checklist", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("lead_checklist").select("*");
      return data || [];
    },
    enabled: !!user,
  });

  const remindersQuery = useQuery({
    queryKey: ["reminders", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("reminders").select("*").order("date", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });

  // Build CRM context
  const crmContext = useMemo(() => {
    if (!leads.length) return "";
    const notes = notesQuery.data || [];
    const docs = docsQuery.data || [];
    const checklist = checklistQuery.data || [];
    const reminders = remindersQuery.data || [];

    const stageCounts: Record<string, number> = {};
    leads.forEach((l) => {
      const label = FUNNEL_STAGES.find((s) => s.key === l.stage)?.label || l.stage;
      stageCounts[label] = (stageCounts[label] || 0) + 1;
    });
    const stagesSummary = Object.entries(stageCounts).map(([s, c]) => `  - ${s}: ${c}`).join("\n");
    const now = Date.now();
    const totalValue = leads.reduce((sum, l) => sum + (l.lives || 0), 0);

    const leadsDetail = leads.map((l) => {
      const stageLabel = FUNNEL_STAGES.find((s) => s.key === l.stage)?.label || l.stage;
      const lastActivity = l.last_contact_at || l.updated_at;
      const idleDays = Math.floor((now - new Date(lastActivity || l.created_at).getTime()) / 86400000);
      const leadInt = interactions.filter((i) => i.lead_id === l.id);
      const intSum = leadInt.length
        ? leadInt.slice(0, 5).map((i) => `      [${i.type}] ${new Date(i.created_at).toLocaleDateString("pt-BR")}: ${i.description}`).join("\n")
        : "      Nenhuma interação";
      const leadNotes = notes.filter((n) => n.lead_id === l.id);
      const notesSum = leadNotes.length
        ? leadNotes.slice(0, 5).map((n) => `      [${n.category}] ${n.content}${n.tags?.length ? ` (tags: ${n.tags.join(", ")})` : ""}`).join("\n")
        : "      Nenhuma observação";
      const leadDocs = docs.filter((d) => d.lead_id === l.id);
      const docsSum = leadDocs.length
        ? leadDocs.map((d) => `      [${d.category}] ${d.file_name}${d.ocr_text ? ` | OCR: ${d.ocr_text.slice(0, 150)}...` : ""}`).join("\n")
        : "      Nenhum documento";
      const leadCheck = checklist.filter((c) => c.lead_id === l.id);
      const checkSum = leadCheck.length
        ? leadCheck.map((c) => `      [${c.completed ? "✅" : "❌"}] ${c.item_name}`).join("\n")
        : "      Nenhum checklist";
      const leadRem = reminders.filter((r) => r.lead_id === l.id);
      const remSum = leadRem.length
        ? leadRem.map((r) => `      [${r.completed ? "✅" : "⏰"}] ${new Date(r.date).toLocaleDateString("pt-BR")}: ${r.description}`).join("\n")
        : "      Nenhum lembrete";

      return `  📋 ${l.name} | Tel: ${l.phone} | Email: ${l.email || "-"} | ${l.type} | ${stageLabel} | ${l.operator || "-"} | ${l.lives || "?"} vidas | ${idleDays}d sem contato
    Interações (${leadInt.length}):\n${intSum}
    Observações (${leadNotes.length}):\n${notesSum}
    Documentos (${leadDocs.length}):\n${docsSum}
    Checklist:\n${checkSum}
    Lembretes:\n${remSum}`;
    }).join("\n\n");

    return `\n=== DADOS COMPLETOS DO CRM ===\nTotal de leads: ${leads.length}\nTotal de vidas: ${totalValue}\nTotal de interações: ${interactions.length}\nTotal de observações: ${notes.length}\nTotal de documentos: ${docs.length}\nLembretes pendentes: ${reminders.filter((r) => !r.completed).length}\n\nFUNIL DE VENDAS:\n${stagesSummary}\n\nDETALHES DE CADA LEAD:\n${leadsDetail}\n===`;
  }, [leads, interactions, notesQuery.data, docsQuery.data, checklistQuery.data, remindersQuery.data]);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Olá! Sou seu assistente CRM Saúde IA. Posso **executar ações** no sistema — sempre com **confirmação** antes!\n\n" +
        "🎯 **Comandos que entendo:**\n" +
        "• *\"Move o lead João para cotação enviada\"*\n" +
        "• *\"Registra uma ligação com a Maria: falamos sobre plano PME\"*\n" +
        "• *\"Cria um lembrete para ligar pro Carlos amanhã às 10h\"*\n" +
        "• *\"Adiciona uma nota no lead Ana: cliente prefere Unimed\"*\n" +
        "• 📎 Envie ou cole (Ctrl+V) um documento e diga a qual lead pertence\n" +
        "• 🎤 Use o microfone para falar!\n\n" +
        "🔒 Antes de qualquer ação, vou mostrar os dados do lead e pedir sua confirmação.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Voice input state
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  // File upload state
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Invalidate all CRM queries after actions
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["interactions"] });
    queryClient.invalidateQueries({ queryKey: ["lead_notes"] });
    queryClient.invalidateQueries({ queryKey: ["lead_documents"] });
    queryClient.invalidateQueries({ queryKey: ["lead_checklist"] });
    queryClient.invalidateQueries({ queryKey: ["reminders"] });
  }, [queryClient]);

  // Voice input
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Navegador não suporta entrada por voz");
      return;
    }
    const recognition = new SR();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? prev + " " : "") + transcript);
      setIsRecording(false);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [isRecording]);

  // File upload
  const handleChatFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length || !user) return;
    for (const file of Array.from(files)) {
      try {
        const filePath = `${user.id}/chat_uploads/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from("lead-images").upload(filePath, file);
        if (error) throw error;
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        setPendingFiles((prev) => [...prev, { file_name: file.name, file_path: filePath, file_type: file.type, file_size: file.size, previewUrl }]);
        toast.success(`📎 "${file.name}" pronto para enviar`);
      } catch (err: any) {
        toast.error(err.message);
      }
    }
    if (chatFileRef.current) chatFileRef.current.value = "";
  };

  // Paste from clipboard
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || !user) return;
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const fileName = file.name === "image.png" ? `captura_${Date.now()}.png` : file.name;
        try {
          const filePath = `${user.id}/chat_uploads/${Date.now()}_${fileName}`;
          const { error } = await supabase.storage.from("lead-images").upload(filePath, file);
          if (error) throw error;
          const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
          setPendingFiles((prev) => [...prev, { file_name: fileName, file_path: filePath, file_type: file.type, file_size: file.size, previewUrl }]);
        } catch (err: any) {
          toast.error(err.message);
        }
        break;
      }
    }
  }, [user]);

  // Drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files?.length || !user) return;
    for (const file of Array.from(files)) {
      try {
        const filePath = `${user.id}/chat_uploads/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from("lead-images").upload(filePath, file);
        if (error) throw error;
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        setPendingFiles((prev) => [...prev, { file_name: file.name, file_path: filePath, file_type: file.type, file_size: file.size, previewUrl }]);
        toast.success(`📎 "${file.name}" pronto para enviar`);
      } catch (err: any) {
        toast.error(err.message);
      }
    }
  }, [user]);

  // Send message
  const send = async () => {
    if (!input.trim() && !pendingFiles.length) return;
    if (loading) return;

    const fileNames = pendingFiles.map((f) => f.file_name).join(", ");
    const userContent = input.trim() || (pendingFiles.length ? `📎 Enviando ${pendingFiles.length} documento(s): ${fileNames}` : "");
    const userMsg: Message = { role: "user", content: userContent, fileInfo: pendingFiles.length ? pendingFiles.map((f) => ({ file_name: f.file_name })) : undefined };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setLoading(true);

    let assistantSoFar = "";
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && prev.length === allMessages.length + 1) {
          return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      };
      if (session?.access_token) {
        headers["x-user-token"] = session.access_token;
      }

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
          crmContext,
          fileInfo: pendingFiles.length ? pendingFiles : undefined,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Erro no assistente");
      }

      const actionsWereTaken = resp.headers.get("x-actions-taken") === "true";
      const actionNamesRaw = resp.headers.get("x-action-names") || "";
      const actionBadges: ActionBadge[] = actionNamesRaw
        .split(",")
        .filter(Boolean)
        .map((name) => {
          const info = ACTION_BADGE_MAP[name] || { label: name, icon: "default" };
          return { action: name, ...info };
        });

      if (!resp.body) throw new Error("No stream");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // If actions were taken, attach badges to the last assistant message and invalidate
      if (actionsWereTaken) {
        setMessages((prev) => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === "assistant") {
              updated[i] = { ...updated[i], actionBadges: actionBadges };
              break;
            }
          }
          return updated;
        });
        invalidateAll();
        toast.success("✅ Ação executada no CRM");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
    setPendingFiles([]);
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold">Assistente IA</h1>
        <p className="text-sm text-muted-foreground">Especialista em planos de saúde — agora com ações no CRM e voz</p>
      </div>

      <Tabs defaultValue="followup" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-fit shrink-0">
          <TabsTrigger value="followup" className="gap-1.5 text-xs">
            <Bell className="h-3.5 w-3.5" /> Follow-Up Inteligente
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5 text-xs">
            <Bot className="h-3.5 w-3.5" /> Chat IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="followup" className="flex-1 overflow-y-auto mt-3 pb-4">
          <FollowUpPanel />
        </TabsContent>

        <TabsContent value="chat" className="flex-1 flex flex-col overflow-hidden mt-3">
          <Card
            className={`flex-1 flex flex-col overflow-hidden relative ${isDragging ? "ring-2 ring-primary ring-offset-2" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isDragging && (
              <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm flex items-center justify-center rounded-lg border-2 border-dashed border-primary">
                <div className="text-center">
                  <FileUp className="h-10 w-10 text-primary mx-auto mb-2" />
                  <p className="text-sm font-medium text-primary">Solte o arquivo aqui</p>
                </div>
              </div>
            )}
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    {msg.fileInfo && msg.fileInfo.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5 text-xs opacity-80">
                        {msg.fileInfo.map((f, fi) => (
                          <span key={fi} className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> {f.file_name}</span>
                        ))}
                      </div>
                    )}
                    {msg.actionBadges && msg.actionBadges.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2 animate-fade-in">
                        {msg.actionBadges.map((badge, bi) => {
                          const IconComp =
                            badge.icon === "move" ? ArrowRightLeft :
                            badge.icon === "interaction" ? Phone :
                            badge.icon === "reminder" ? CalendarClock :
                            badge.icon === "note" ? StickyNote :
                            badge.icon === "document" ? FileUp : CheckCircle2;
                          return (
                            <span
                              key={bi}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2.5 py-0.5 text-xs font-medium animate-scale-in"
                              style={{ animationDelay: `${bi * 100}ms`, animationFillMode: "backwards" }}
                            >
                              <IconComp className="h-3 w-3" />
                              {badge.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="h-8 w-8 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-secondary" />
                    </div>
                  )}
                </div>
              ))}
              {loading && messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-2xl px-4 py-3">
                    <div className="flex gap-1">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" />
                      <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                      <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </CardContent>

            {/* Pending file indicator */}
            {pendingFiles.length > 0 && (
              <div className="px-4 py-2 border-t border-border flex flex-wrap items-center gap-2 bg-muted/50">
                {pendingFiles.map((pf, idx) => (
                  <div key={idx} className="inline-flex items-center gap-1.5 bg-background rounded-lg px-2 py-1 border border-border">
                    {pf.previewUrl ? (
                      <img src={pf.previewUrl} alt={pf.file_name} className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="text-xs text-muted-foreground max-w-[120px] truncate">{pf.file_name}</span>
                    <Button size="sm" variant="ghost" className="h-4 w-4 p-0" onClick={() => {
                      if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
                      setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
                    }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="text-xs h-6" onClick={() => setPendingFiles([])}>
                  Limpar todos
                </Button>
              </div>
            )}

            <div className="p-4 border-t border-border">
              <input ref={chatFileRef} type="file" multiple className="hidden" onChange={handleChatFileUpload} />
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => chatFileRef.current?.click()}
                  disabled={loading}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={isRecording ? "destructive" : "ghost"}
                  className="shrink-0"
                  onClick={toggleRecording}
                  disabled={loading}
                >
                  {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                <Input
                  placeholder={isRecording ? "🎤 Ouvindo..." : "Digite, cole ou use o microfone..."}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={handlePaste}
                  disabled={loading}
                  className={isRecording ? "border-destructive" : ""}
                />
                <Button type="submit" size="icon" disabled={loading || (!input.trim() && !pendingFiles.length)}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
