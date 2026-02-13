import { useState, useRef } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { useLeadObservations, NOTE_CATEGORIES, DOC_CATEGORIES } from "@/hooks/useLeadObservations";
import { useLeadMembers } from "@/hooks/useLeadMembers";
import { supabase } from "@/integrations/supabase/client";
import { useContactAttempts } from "@/hooks/useContactAttempts";
import { Lead, FUNNEL_STAGES, FunnelStage } from "@/types/lead";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LeadObservationsPanel } from "@/components/leads/LeadObservationsPanel";
import { LeadConversationTab } from "@/components/leads/LeadConversationTab";
import { LeadMemoryCard } from "@/components/leads/LeadMemoryCard";
import { PlaybookTab } from "@/components/leads/PlaybookTab";
import { MemberSection } from "@/components/leads/MemberSection";
import {
  MessageCircle, Phone, Mail, User, Clock, Info, StickyNote,
  Maximize2, Minimize2, Pencil, Save, X, Loader2, FileUp,
  Upload, Download, Eye, Trash2, File, Image as ImageIcon,
  FolderDown, Sparkles, Tag, Plus, Copy, Check, PhoneCall, BookOpen, Target,
} from "lucide-react";
import { FollowUpPanel } from "@/components/followup/FollowUpPanel";
import { ClosingTimeline } from "@/components/closing/ClosingTimeline";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import JSZip from "jszip";

interface Props {
  lead: Lead | null;
  onClose: () => void;
}

interface EditForm {
  name: string;
  phone: string;
  email: string;
  type: string;
  plan_type: string;
  operator: string;
  lives: string;
  notes: string;
  stage: string;
  lost_reason: string;
}

function leadToForm(lead: Lead): EditForm {
  return {
    name: lead.name,
    phone: lead.phone,
    email: lead.email || "",
    type: lead.type,
    plan_type: lead.plan_type || "",
    operator: lead.operator || "",
    lives: lead.lives ? String(lead.lives) : "",
    notes: lead.notes || "",
    stage: lead.stage,
    lost_reason: lead.lost_reason || "",
  };
}

function LeadEditForm({ lead, onSaved, onCancel }: { lead: Lead; onSaved: () => void; onCancel: () => void }) {
  const { updateLead } = useLeadsContext();
  const [form, setForm] = useState<EditForm>(leadToForm(lead));
  const [saving, setSaving] = useState(false);

  const set = (field: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast({ title: "Nome e telefone são obrigatórios", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateLead(lead.id, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        type: form.type,
        plan_type: form.plan_type || null,
        operator: form.operator.trim() || null,
        lives: form.lives ? parseInt(form.lives) : null,
        notes: form.notes.trim() || null,
        stage: form.stage,
        lost_reason: form.lost_reason.trim() || null,
      });
      toast({ title: "Lead atualizado com sucesso!" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const needsLostReason = form.stage === "declinado" || form.stage === "cancelado";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <Label className="text-xs">Nome *</Label>
          <Input value={form.name} onChange={set("name")} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Telefone *</Label>
          <Input value={form.phone} onChange={set("phone")} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input value={form.email} onChange={set("email")} type="email" className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PF">Pessoa Física</SelectItem>
              <SelectItem value="ADESAO">Adesão</SelectItem>
              <SelectItem value="PME">PME</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Tipo de Plano</Label>
          <Select value={form.plan_type || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, plan_type: v === "_none" ? "" : v }))}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Nenhum</SelectItem>
              <SelectItem value="Individual">Individual</SelectItem>
              <SelectItem value="Familiar">Familiar</SelectItem>
              <SelectItem value="Adesão">Adesão</SelectItem>
              <SelectItem value="PME">PME</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Operadora</Label>
          <Input value={form.operator} onChange={set("operator")} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Qtd. Vidas</Label>
          <Input value={form.lives} onChange={set("lives")} type="number" min="1" className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Etapa do Funil</Label>
          <Select value={form.stage} onValueChange={(v) => setForm((f) => ({ ...f, stage: v }))}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FUNNEL_STAGES.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {needsLostReason && (
          <div>
            <Label className="text-xs">Motivo da Perda</Label>
            <Input value={form.lost_reason} onChange={set("lost_reason")} className="h-9 text-sm" />
          </div>
        )}
        <div className="md:col-span-2">
          <Label className="text-xs">Observações</Label>
          <Textarea value={form.notes} onChange={set("notes")} rows={3} className="text-sm" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1 gap-1.5 h-9 text-sm">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving} className="h-9 text-sm gap-1.5">
          <X className="h-3.5 w-3.5" /> Cancelar
        </Button>
      </div>
    </div>
  );
}

/* ─── General Docs Section for Fullscreen ─── */
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, FileText as FileTextIcon } from "lucide-react";
import { motion } from "framer-motion";

function GeneralDocsSectionFullscreen({ documents, docCategory, setDocCategory, fileRef, uploading, handleFileUpload, handlePreview, handleDownload, onDeleteDoc }: {
  documents: any[]; docCategory: string; setDocCategory: (v: string) => void; fileRef: React.RefObject<HTMLInputElement>;
  uploading: boolean; handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handlePreview: (fp: string, fn: string, ft: string) => void; handleDownload: (fp: string, fn: string) => void; onDeleteDoc: (doc: any) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div className="rounded-lg border bg-gradient-to-b from-muted/40 to-muted/20 border-border/60 overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2.5 w-full px-3 py-2.5 hover:bg-accent/30 transition-colors">
          <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
            <FileTextIcon className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold tracking-wide flex-1 text-left">Documentos Gerais</span>
          <Badge variant="secondary" className="text-[9px] font-medium tabular-nums">{documents.length}</Badge>
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </motion.div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-2 pb-2 space-y-2">
            <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
            <div className="flex gap-2">
              <Select value={docCategory} onValueChange={setDocCategory}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_CATEGORIES.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}</SelectContent>
              </Select>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Enviar
              </Button>
            </div>
            {documents.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-2">Nenhum documento geral</p>}
            {documents.map((doc: any) => {
              const isImage = doc.file_type?.startsWith("image/");
              return (
                <div key={doc.id} className="flex items-center gap-2.5 p-2 rounded-md border border-border bg-card hover:bg-accent/20 transition-colors group">
                  <div className="h-7 w-7 rounded-md bg-background border border-border flex items-center justify-center shrink-0">
                    {isImage ? <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" /> : <File className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{doc.file_name}</p>
                    <Badge variant="outline" className="text-[8px] mt-0.5">{DOC_CATEGORIES.find((c: any) => c.value === doc.category)?.label || doc.category}</Badge>
                  </div>
                  <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handlePreview(doc.file_path, doc.file_name, doc.file_type || "")}><Eye className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDownload(doc.file_path, doc.file_name)}><Download className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onDeleteDoc(doc)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/* ═══════════ FULLSCREEN COMPLETE VIEW ═══════════ */

function FullscreenLeadView({ lead, isEditing, onStartEdit, onStopEdit }: {
  lead: Lead; isEditing: boolean; onStartEdit: () => void; onStopEdit: () => void;
}) {
  const { getLeadInteractions } = useLeadsContext();
  const obs = useLeadObservations(lead.id);
  const membersHook = useLeadMembers(lead.id);
  const interactions = getLeadInteractions(lead.id);
  const { totalAttempts, responseRate, lastAttemptAt } = useContactAttempts(lead.phone);
  const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);
  const whatsappUrl = `https://wa.me/55${lead.phone.replace(/\D/g, "")}`;

  // Document state
  const [docCategory, setDocCategory] = useState("outros");
  const [uploading, setUploading] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string; type: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Notes state
  const [noteContent, setNoteContent] = useState("");
  const [noteCategory, setNoteCategory] = useState("geral");
  const [noteTagInput, setNoteTagInput] = useState("");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSearch, setNoteSearch] = useState("");

  // AI state
  const [summary, setSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const [whatsappMsg, setWhatsappMsg] = useState("");
  const [showMsgDialog, setShowMsgDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  const iconMap: Record<string, React.ReactNode> = {
    call: <Phone className="h-3.5 w-3.5" />,
    whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
    meeting: <User className="h-3.5 w-3.5" />,
    email: <Mail className="h-3.5 w-3.5" />,
    note: <Clock className="h-3.5 w-3.5" />,
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await obs.uploadDocument({ file, category: docCategory });
      }
      toast({ title: `${files.length} arquivo(s) enviado(s)!` });
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e.message, variant: "destructive" });
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from("lead-images").download(filePath);
    if (error) { toast({ title: "Erro ao baixar", variant: "destructive" }); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async (filePath: string, fileName: string, fileType: string) => {
    const { data, error } = await supabase.storage.from("lead-images").download(filePath);
    if (error) { toast({ title: "Erro ao visualizar", variant: "destructive" }); return; }
    const url = URL.createObjectURL(data);
    setPreviewDoc({ url, name: fileName, type: fileType });
  };

  const addTag = () => {
    const tag = noteTagInput.trim().toLowerCase();
    if (tag && !noteTags.includes(tag)) setNoteTags((prev) => [...prev, tag]);
    setNoteTagInput("");
  };

  const handleSaveNote = async () => {
    if (!noteContent.trim()) return;
    setSavingNote(true);
    try {
      await obs.addNote({ content: noteContent.trim(), category: noteCategory, tags: noteTags });
      setNoteContent(""); setNoteTags([]);
      toast({ title: "Nota salva!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar nota", description: e.message, variant: "destructive" });
    }
    setSavingNote(false);
  };

  const handleGenerateSummary = async () => {
    setLoadingSummary(true); setSummary("");
    try {
      const { data, error } = await supabase.functions.invoke("lead-summary", {
        body: { lead, interactions, notes: obs.notes },
      });
      if (error) throw error;
      setSummary(data.summary);
    } catch (e: any) {
      toast({ title: "Erro ao gerar resumo", description: e.message, variant: "destructive" });
    }
    setLoadingSummary(false);
  };

  const handleGenerateWhatsAppMsg = async () => {
    if (!obs.documents.length) {
      toast({ title: "Nenhum documento", description: "Adicione documentos antes.", variant: "destructive" });
      return;
    }
    setGeneratingMsg(true); setWhatsappMsg(""); setCopied(false);
    try {
      const docsWithLinks = await Promise.all(
        obs.documents.map(async (doc: any) => {
          const catLabel = DOC_CATEGORIES.find((c) => c.value === doc.category)?.label || doc.category;
          const { data: signedData } = await supabase.storage.from("lead-images").createSignedUrl(doc.file_path, 60 * 60 * 24 * 7);
          return { catLabel, fileName: doc.file_name, url: signedData?.signedUrl || null };
        })
      );
      const docList = docsWithLinks.map((d) => d.url ? `- ${d.catLabel}: ${d.fileName}\n  🔗 Link: ${d.url}` : `- ${d.catLabel}: ${d.fileName}`).join("\n");

      const prompt = `Gere uma mensagem profissional para WhatsApp ao time de emissão.\n\nDados: Nome: ${lead.name}, Tel: ${lead.phone}, Tipo: ${lead.type}, Operadora: ${lead.operator || "-"}, Plano: ${lead.plan_type || "-"}, Vidas: ${lead.lives || "-"}\n\nDocumentos:\n${docList}\n\nFormato: saudação, dados do cliente, lista de docs com links, fechamento profissional. Emojis moderados. Links válidos 7 dias.`;

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }], crmContext: "" }),
      });
      if (!resp.ok) throw new Error("Erro ao gerar mensagem");

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "", fullMsg = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });
        let ni: number;
        while ((ni = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, ni);
          textBuffer = textBuffer.slice(ni + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ") || line.startsWith(":") || !line.trim()) continue;
          const js = line.slice(6).trim();
          if (js === "[DONE]") break;
          try { const p = JSON.parse(js); const c = p.choices?.[0]?.delta?.content; if (c) { fullMsg += c; setWhatsappMsg(fullMsg); } } catch { textBuffer = line + "\n" + textBuffer; break; }
        }
      }
      setShowMsgDialog(true);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setGeneratingMsg(false);
  };

  const filteredNotes = obs.notes.filter((n: any) => {
    if (!noteSearch) return true;
    const q = noteSearch.toLowerCase();
    return n.content.toLowerCase().includes(q) || (n.tags || []).some((t: string) => t.includes(q)) || n.category.toLowerCase().includes(q);
  });

  if (isEditing) {
    return <LeadEditForm lead={lead} onSaved={onStopEdit} onCancel={onStopEdit} />;
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {/* ═══ COLUMN 1: Info + Contact ═══ */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" /> Informações
            </h3>
            <Button variant="outline" size="sm" onClick={onStartEdit} className="h-7 text-[11px] gap-1">
              <Pencil className="h-3 w-3" /> Editar
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{lead.phone}</span>
            </div>
            {lead.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{lead.email}</span>
              </div>
            )}
            <Button asChild size="sm" className="w-full gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground h-8 text-xs">
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </a>
            </Button>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground text-xs">Tipo</span><p className="font-medium">{lead.type}</p></div>
            {lead.plan_type && <div><span className="text-muted-foreground text-xs">Plano</span><p className="font-medium">{lead.plan_type}</p></div>}
            {lead.operator && <div><span className="text-muted-foreground text-xs">Operadora</span><p className="font-medium">{lead.operator}</p></div>}
            {lead.lives && <div><span className="text-muted-foreground text-xs">Vidas</span><p className="font-medium">{lead.lives}</p></div>}
          </div>
          {lead.notes && (
            <div><span className="text-muted-foreground text-xs">Observações</span><p className="text-sm mt-1">{lead.notes}</p></div>
          )}
          {lead.lost_reason && (
            <div><span className="text-muted-foreground text-xs">Motivo da Perda</span><p className="text-sm mt-1 text-destructive">{lead.lost_reason}</p></div>
          )}

          <Separator />

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Criado: {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}</p>
            <p>Atualizado: {formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true, locale: ptBR })}</p>
            {lead.last_contact_at && <p>Último contato: {formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: true, locale: ptBR })}</p>}
          </div>

          <Separator />

          {/* Follow-up Progress */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
              <PhoneCall className="h-3.5 w-3.5" /> Follow-up
            </h3>
            {(() => {
              const goal = 6;
              const progress = Math.min(totalAttempts, goal);
              const pct = (progress / goal) * 100;
              const isComplete = progress >= goal;
              return (
                <div className="space-y-2 p-2.5 rounded-lg border border-border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{progress}/{goal} dias</span>
                    {responseRate > 0 && (
                      <Badge variant="secondary" className="text-[10px]" style={{ color: responseRate > 50 ? "hsl(140, 70%, 40%)" : "hsl(35, 85%, 50%)" }}>
                        {responseRate}% resp.
                      </Badge>
                    )}
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: isComplete ? "hsl(140, 70%, 40%)" : stageInfo?.color }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {isComplete ? "✅ Meta de 6 dias atingida" : `Faltam ${goal - progress} dia(s) de contato`}
                  </p>
                </div>
              );
            })()}
          </div>

          {/* AI Summary */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Inteligência Artificial
            </h3>
            <Button onClick={handleGenerateSummary} disabled={loadingSummary} size="sm" className="w-full gap-1.5 h-8 text-xs">
              {loadingSummary ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Gerar Resumo IA
            </Button>
            {summary && (
              <div className="p-2.5 rounded-lg border border-primary/20 bg-primary/5 prose prose-sm max-w-none">
                <div className="text-xs leading-relaxed [&>h1]:text-sm [&>h2]:text-xs [&>h3]:text-xs [&>p]:text-xs [&>ul]:text-xs [&>ol]:text-xs">
                  <ReactMarkdown>{summary}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══ COLUMN 2: Documents (organized by member) ═══ */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <FileUp className="h-3.5 w-3.5" /> Documentos ({obs.documents.length})
          </h3>

          {obs.documents.length > 1 && (
            <Button size="sm" variant="outline" className="w-full h-7 gap-1.5 text-[11px]" disabled={downloadingAll}
              onClick={async () => {
                setDownloadingAll(true);
                try {
                  const zip = new JSZip();
                  for (const doc of obs.documents) { const { data, error } = await supabase.storage.from("lead-images").download((doc as any).file_path); if (!error && data) zip.file((doc as any).file_name, data); }
                  const blob = await zip.generateAsync({ type: "blob" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = `documentos_${lead.name.replace(/\s+/g, "_")}.zip`; a.click(); URL.revokeObjectURL(url);
                  toast({ title: "Download concluído!" });
                } catch (e: any) { toast({ title: "Erro", description: e.message, variant: "destructive" }); }
                setDownloadingAll(false);
              }}>
              {downloadingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderDown className="h-3 w-3" />}
              Baixar todos (.zip)
            </Button>
          )}

          {obs.documents.length > 0 && (
            <Button size="sm" variant="outline" className="w-full h-7 gap-1.5 text-[11px] border-secondary/30 text-secondary hover:bg-secondary/10" disabled={generatingMsg} onClick={handleGenerateWhatsAppMsg}>
              {generatingMsg ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
              Mensagem para emissão
            </Button>
          )}

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {/* Documentos Gerais */}
            <GeneralDocsSectionFullscreen
              documents={obs.documents.filter((d: any) => !d.member_id)}
              docCategory={docCategory}
              setDocCategory={setDocCategory}
              fileRef={fileRef}
              uploading={uploading}
              handleFileUpload={handleFileUpload}
              handlePreview={handlePreview}
              handleDownload={handleDownload}
              onDeleteDoc={(doc: any) => obs.deleteDocument({ id: doc.id, file_path: doc.file_path })}
            />
            <MemberSection
              role="titular"
              members={membersHook.titulares}
              documents={obs.documents as any}
              onAddMember={membersHook.addMember}
              onDeleteMember={membersHook.deleteMember}
              onUpdateMember={membersHook.updateMember}
              onUploadDoc={async (p) => obs.uploadDocument({ file: p.file, category: p.category, memberId: p.memberId })}
              onDeleteDoc={(doc) => obs.deleteDocument({ id: doc.id, file_path: doc.file_path })}
              onPreview={handlePreview}
              onDownload={handleDownload}
            />
            <MemberSection
              role="dependente"
              members={membersHook.dependentes}
              documents={obs.documents as any}
              onAddMember={membersHook.addMember}
              onDeleteMember={membersHook.deleteMember}
              onUpdateMember={membersHook.updateMember}
              onUploadDoc={async (p) => obs.uploadDocument({ file: p.file, category: p.category, memberId: p.memberId })}
              onDeleteDoc={(doc) => obs.deleteDocument({ id: doc.id, file_path: doc.file_path })}
              onPreview={handlePreview}
              onDownload={handleDownload}
            />
          </div>
        </div>

        {/* ═══ COLUMN 3: Notes + Timeline ═══ */}
        <div className="space-y-4">
          {/* Notes */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" /> Notas ({obs.notes.length})
            </h3>
            <Textarea placeholder="Adicionar observação..." value={noteContent} onChange={(e) => setNoteContent(e.target.value)} rows={2} className="text-sm" />
            <div className="flex gap-1.5">
              <Select value={noteCategory} onValueChange={setNoteCategory}>
                <SelectTrigger className="h-7 text-[11px] w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NOTE_CATEGORIES.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
                </SelectContent>
              </Select>
              <Input placeholder="Tag..." value={noteTagInput} onChange={(e) => setNoteTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())} className="h-7 text-[11px] flex-1" />
              <Button size="sm" variant="ghost" onClick={addTag} className="h-7 px-1.5"><Tag className="h-3 w-3" /></Button>
            </div>
            {noteTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {noteTags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[9px] gap-0.5 cursor-pointer" onClick={() => setNoteTags((p) => p.filter((x) => x !== t))}>
                    {t} <X className="h-2.5 w-2.5" />
                  </Badge>
                ))}
              </div>
            )}
            <Button size="sm" onClick={handleSaveNote} disabled={savingNote || !noteContent.trim()} className="w-full h-7 text-xs">
              {savingNote ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              Salvar Nota
            </Button>

            <Input placeholder="Buscar notas..." value={noteSearch} onChange={(e) => setNoteSearch(e.target.value)} className="h-7 text-[11px]" />

            <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
              {filteredNotes.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhuma nota</p>}
              {filteredNotes.map((note: any) => (
                <div key={note.id} className="p-2 rounded-lg border border-border bg-card space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[9px]">{NOTE_CATEGORIES.find((c) => c.value === note.category)?.label || note.category}</Badge>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] text-muted-foreground">{format(new Date(note.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => obs.deleteNote(note.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                    </div>
                  </div>
                  <p className="text-xs whitespace-pre-wrap">{note.content}</p>
                  {note.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1">{note.tags.map((t: string) => <Badge key={t} variant="secondary" className="text-[9px]">{t}</Badge>)}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Timeline */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Timeline ({interactions.length})
            </h3>
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
              {interactions.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhuma interação</p>}
              {interactions.map((int) => (
                <div key={int.id} className="flex gap-2">
                  <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    {iconMap[int.type] || <Clock className="h-3 w-3" />}
                  </div>
                  <div>
                    <p className="text-xs">{int.description}</p>
                    <p className="text-[10px] text-muted-foreground">{format(new Date(int.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ COLUMN 4: WhatsApp Conversation + Memory ═══ */}
        <div className="space-y-3">
          <LeadMemoryCard leadId={lead.id} leadName={lead.name} />
          <h3 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" /> Conversa
          </h3>
          <LeadConversationTab leadPhone={lead.phone} leadName={lead.name} />
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={() => { if (previewDoc) URL.revokeObjectURL(previewDoc.url); setPreviewDoc(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader><DialogTitle className="text-sm truncate">{previewDoc?.name}</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            {previewDoc?.type?.startsWith("image/") ? (
              <img src={previewDoc.url} alt={previewDoc.name} className="w-full h-auto rounded-lg object-contain max-h-[70vh]" />
            ) : previewDoc?.type === "application/pdf" ? (
              <iframe src={previewDoc.url} className="w-full h-[70vh] rounded-lg border-0" title={previewDoc.name} />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <File className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Pré-visualização não disponível</p>
                <Button size="sm" onClick={() => previewDoc && handleDownload(previewDoc.url, previewDoc.name)} className="gap-1">
                  <Download className="h-3 w-3" /> Baixar
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Message Dialog */}
      <Dialog open={showMsgDialog} onOpenChange={setShowMsgDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Mensagem para Emissão
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 p-3 rounded-lg border border-border bg-muted/50">
            <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{whatsappMsg}</pre>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs" onClick={async () => { await navigator.clipboard.writeText(whatsappMsg); setCopied(true); toast({ title: "Copiado!" }); setTimeout(() => setCopied(false), 2000); }}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copiado!" : "Copiar"}
            </Button>
            <Button size="sm" className="flex-1 gap-1.5 text-xs bg-secondary hover:bg-secondary/90 text-secondary-foreground"
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(whatsappMsg)}`, "_blank")}>
              <MessageCircle className="h-3 w-3" /> WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ═══════════ SIDEBAR (COMPACT) VIEW ═══════════ */

function SidebarLeadContent({ lead, isEditing, onStartEdit, onStopEdit }: {
  lead: Lead; isEditing: boolean; onStartEdit: () => void; onStopEdit: () => void;
}) {
  const { getLeadInteractions } = useLeadsContext();
  const interactions = getLeadInteractions(lead.id);
  const { totalAttempts, responseRate } = useContactAttempts(lead.phone);
  const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);
  const whatsappUrl = `https://wa.me/55${lead.phone.replace(/\D/g, "")}`;

  const iconMap: Record<string, React.ReactNode> = {
    call: <Phone className="h-3.5 w-3.5" />,
    whatsapp: <MessageCircle className="h-3.5 w-3.5" />,
    meeting: <User className="h-3.5 w-3.5" />,
    email: <Mail className="h-3.5 w-3.5" />,
    note: <Clock className="h-3.5 w-3.5" />,
  };

  return (
    <Tabs defaultValue="info" className="mt-4">
      <TabsList className={`w-full grid ${isEditing ? "grid-cols-1" : "grid-cols-6"} h-9`}>
        <TabsTrigger value="info" className="text-xs gap-1">
          <Info className="h-3 w-3" /> {isEditing ? "Editando Lead" : "Info"}
        </TabsTrigger>
        {!isEditing && (
          <TabsTrigger value="playbook" className="text-xs gap-1">
            <BookOpen className="h-3 w-3" /> Playbook
          </TabsTrigger>
        )}
        {!isEditing && (
          <TabsTrigger value="observations" className="text-xs gap-1">
            <StickyNote className="h-3 w-3" /> Notas
          </TabsTrigger>
        )}
        {!isEditing && (
          <TabsTrigger value="followup" className="text-xs gap-1">
            <PhoneCall className="h-3 w-3" /> Follow-Up
          </TabsTrigger>
        )}
        {!isEditing && (
          <TabsTrigger value="closing" className="text-xs gap-1">
            <Target className="h-3 w-3" /> Fechamento
          </TabsTrigger>
        )}
        {!isEditing && (
          <TabsTrigger value="conversation" className="text-xs gap-1">
            <MessageCircle className="h-3 w-3" /> Conversa
          </TabsTrigger>
        )}</TabsList>

      <TabsContent value="info">
        {isEditing ? (
          <LeadEditForm lead={lead} onSaved={onStopEdit} onCancel={onStopEdit} />
        ) : (
          <div className="space-y-5 mt-3">
            <LeadMemoryCard leadId={lead.id} leadName={lead.name} />
            <Button variant="outline" size="sm" onClick={onStartEdit} className="w-full gap-1.5 h-8 text-xs">
              <Pencil className="h-3 w-3" /> Editar dados do lead
            </Button>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">Contato</h3>
              <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><span>{lead.phone}</span></div>
              {lead.email && <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /><span>{lead.email}</span></div>}
              <Button asChild size="sm" className="w-full gap-2 bg-secondary hover:bg-secondary/90 text-secondary-foreground">
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> Abrir WhatsApp</a>
              </Button>
            </div>

            <Separator />

            {/* Follow-up Progress */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                <PhoneCall className="h-3.5 w-3.5" /> Follow-up
              </h3>
              {(() => {
                const goal = 6;
                const progress = Math.min(totalAttempts, goal);
                const pct = (progress / goal) * 100;
                const isComplete = progress >= goal;
                return (
                  <div className="space-y-2 p-2.5 rounded-lg border border-border bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{progress}/{goal} dias</span>
                      {responseRate > 0 && (
                        <Badge variant="secondary" className="text-[10px]" style={{ color: responseRate > 50 ? "hsl(140, 70%, 40%)" : "hsl(35, 85%, 50%)" }}>
                          {responseRate}% resp.
                        </Badge>
                      )}
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: isComplete ? "hsl(140, 70%, 40%)" : stageInfo?.color }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {isComplete ? "✅ Meta de 6 dias atingida" : `Faltam ${goal - progress} dia(s) de contato`}
                    </p>
                  </div>
                );
              })()}
            </div>

            <Separator />

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">Detalhes</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground text-xs">Tipo</span><p className="font-medium">{lead.type}</p></div>
                {lead.plan_type && <div><span className="text-muted-foreground text-xs">Plano</span><p className="font-medium">{lead.plan_type}</p></div>}
                {lead.operator && <div><span className="text-muted-foreground text-xs">Operadora</span><p className="font-medium">{lead.operator}</p></div>}
                {lead.lives && <div><span className="text-muted-foreground text-xs">Vidas</span><p className="font-medium">{lead.lives}</p></div>}
              </div>
              {lead.notes && <div><span className="text-muted-foreground text-xs">Observações</span><p className="text-sm mt-1">{lead.notes}</p></div>}
              {lead.lost_reason && <div><span className="text-muted-foreground text-xs">Motivo da Perda</span><p className="text-sm mt-1 text-destructive">{lead.lost_reason}</p></div>}
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase">Timeline</h3>
              {interactions.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma interação registrada</p>}
              {interactions.map((int) => (
                <div key={int.id} className="flex gap-3">
                  <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">{iconMap[int.type] || <Clock className="h-3.5 w-3.5" />}</div>
                  <div>
                    <p className="text-sm">{int.description}</p>
                    <p className="text-[10px] text-muted-foreground">{format(new Date(int.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="text-xs text-muted-foreground space-y-1">
              <p>Criado: {format(new Date(lead.created_at), "dd/MM/yyyy", { locale: ptBR })}</p>
              <p>Atualizado: {formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true, locale: ptBR })}</p>
              {lead.last_contact_at && <p>Último contato: {formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: true, locale: ptBR })}</p>}
            </div>
          </div>
        )}
      </TabsContent>

      {!isEditing && (
        <TabsContent value="playbook" className="mt-3">
          <PlaybookTab lead={lead} />
        </TabsContent>
      )}
      {!isEditing && (
        <TabsContent value="observations" className="mt-3">
          <LeadObservationsPanel lead={lead} />
        </TabsContent>
      )}
      {!isEditing && (
        <TabsContent value="followup" className="mt-3">
          <FollowUpPanel singleLeadId={lead.id} />
        </TabsContent>
      )}
      {!isEditing && (
        <TabsContent value="closing" className="mt-3">
          <ClosingTimeline leadId={lead.id} leadStage={lead.stage} />
        </TabsContent>
      )}
      {!isEditing && (
        <TabsContent value="conversation" className="mt-3">
          <LeadConversationTab leadPhone={lead.phone} leadName={lead.name} compact />
        </TabsContent>
      )}
    </Tabs>
  );
}

/* ═══════════ MAIN EXPORT ═══════════ */

export function LeadDetailSheet({ lead, onClose }: Props) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  if (!lead) return null;

  const stageInfo = FUNNEL_STAGES.find((s) => s.key === lead.stage);

  const handleClose = () => { setIsFullscreen(false); setIsEditing(false); onClose(); };

  const header = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-primary font-bold text-sm">{lead.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</span>
        </div>
        <div>
          <p className="text-lg font-bold">{lead.name}</p>
          <Badge variant="outline" className="text-[10px]" style={{ borderColor: stageInfo?.color, color: stageInfo?.color }}>{stageInfo?.label}</Badge>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {!isEditing && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }} title="Editar lead">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setIsFullscreen(!isFullscreen); }} title={isFullscreen ? "Painel lateral" : "Tela cheia"}>
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );

  if (isFullscreen) {
    return (
      <>
        <Sheet open={!!lead} onOpenChange={handleClose}>
          <SheetContent className="hidden"><SheetHeader><SheetTitle /></SheetHeader></SheetContent>
        </Sheet>
        <Dialog open onOpenChange={handleClose}>
          <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle asChild>{header}</DialogTitle>
            </DialogHeader>
            <FullscreenLeadView lead={lead} isEditing={isEditing} onStartEdit={() => setIsEditing(true)} onStopEdit={() => setIsEditing(false)} />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Sheet open={!!lead} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle asChild>{header}</SheetTitle>
        </SheetHeader>
        <SidebarLeadContent lead={lead} isEditing={isEditing} onStartEdit={() => setIsEditing(true)} onStopEdit={() => setIsEditing(false)} />
      </SheetContent>
    </Sheet>
  );
}
