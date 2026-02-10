import { useState, useRef } from "react";
import { useLeadObservations, NOTE_CATEGORIES, DOC_CATEGORIES } from "@/hooks/useLeadObservations";
import { useLeadMembers } from "@/hooks/useLeadMembers";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/lead";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  StickyNote, FileUp, Sparkles, Plus, Trash2, Upload,
  Loader2, X, Tag, Download, File, Image as ImageIcon, Eye, FolderDown,
  MessageCircle, Copy, Check, FileText, ChevronDown, ChevronRight,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import ReactMarkdown from "react-markdown";
import JSZip from "jszip";
import { EmissionFormDialog } from "./EmissionFormDialog";
import { MemberSection } from "./MemberSection";

interface Props {
  lead: Lead;
}

/* ─── Documentos Gerais (sem membro vinculado) ─── */
function GeneralDocsSection({
  documents, docCategory, setDocCategory, fileRef, uploading, handleFileUpload,
  handlePreview, handleDownload, onDeleteDoc,
}: {
  documents: any[];
  docCategory: string;
  setDocCategory: (v: string) => void;
  fileRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handlePreview: (fp: string, fn: string, ft: string) => void;
  handleDownload: (fp: string, fn: string) => void;
  onDeleteDoc: (doc: any) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="rounded-lg border bg-gradient-to-b from-muted/40 to-muted/20 border-border/60 overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2.5 w-full px-3 py-2.5 hover:bg-accent/30 transition-colors">
          <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
            <FileText className="h-3.5 w-3.5 text-primary" />
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
                <SelectTrigger className="h-8 text-xs flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Enviar
              </Button>
            </div>
            {documents.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-2">Nenhum documento geral</p>}
            <AnimatePresence>
              {documents.map((doc: any) => {
                const isImage = doc.file_type?.startsWith("image/");
                return (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="flex items-center gap-2.5 p-2 rounded-md border border-border bg-card hover:bg-accent/20 transition-colors group"
                  >
                    <div className="h-7 w-7 rounded-md bg-background border border-border flex items-center justify-center shrink-0">
                      {isImage ? <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" /> : <File className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">{doc.file_name}</p>
                      <Badge variant="outline" className="text-[8px] mt-0.5">
                        {DOC_CATEGORIES.find((c: any) => c.value === doc.category)?.label || doc.category}
                      </Badge>
                    </div>
                    <div className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handlePreview(doc.file_path, doc.file_name, doc.file_type || "")}>
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDownload(doc.file_path, doc.file_name)}>
                        <Download className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onDeleteDoc(doc)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function LeadObservationsPanel({ lead }: Props) {
  const { getLeadInteractions } = useLeadsContext();
  const obs = useLeadObservations(lead.id);
  const membersHook = useLeadMembers(lead.id);
  // Notes state
  const [noteContent, setNoteContent] = useState("");
  const [noteCategory, setNoteCategory] = useState("geral");
  const [noteTagInput, setNoteTagInput] = useState("");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSearch, setNoteSearch] = useState("");

  // Document state
  const [docCategory, setDocCategory] = useState("outros");
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string; type: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // AI summary state
  const [summary, setSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const [whatsappMsg, setWhatsappMsg] = useState("");
  const [showMsgDialog, setShowMsgDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEmissionForm, setShowEmissionForm] = useState(false);
  const addTag = () => {
    const tag = noteTagInput.trim().toLowerCase();
    if (tag && !noteTags.includes(tag)) {
      setNoteTags((prev) => [...prev, tag]);
    }
    setNoteTagInput("");
  };

  const handleSaveNote = async () => {
    if (!noteContent.trim()) return;
    setSavingNote(true);
    try {
      await obs.addNote({ content: noteContent.trim(), category: noteCategory, tags: noteTags });
      setNoteContent("");
      setNoteTags([]);
      toast({ title: "Nota salva!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar nota", description: e.message, variant: "destructive" });
    }
    setSavingNote(false);
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
    if (error) {
      toast({ title: "Erro ao baixar", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async (filePath: string, fileName: string, fileType: string) => {
    const { data, error } = await supabase.storage.from("lead-images").download(filePath);
    if (error) {
      toast({ title: "Erro ao visualizar", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    setPreviewDoc({ url, name: fileName, type: fileType });
  };


  const handleGenerateSummary = async () => {
    setLoadingSummary(true);
    setSummary("");
    try {
      const interactions = getLeadInteractions(lead.id);
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

  const handleOpenEmissionForm = () => {
    if (!obs.documents.length) {
      toast({ title: "Nenhum documento", description: "Adicione documentos antes de gerar a mensagem.", variant: "destructive" });
      return;
    }
    setShowEmissionForm(true);
  };

  const handleGenerateWhatsAppMsg = async (formData: { vigencia: string; nomePlano: string; nomeTitular: string; emailTitular: string; celularTitular: string }) => {
    setShowEmissionForm(false);
    setGeneratingMsg(true);
    setWhatsappMsg("");
    setCopied(false);
    try {
      // Build signed URLs for all docs
      const docsWithLinks = await Promise.all(
        obs.documents.map(async (doc: any) => {
          const catLabel = DOC_CATEGORIES.find((c) => c.value === doc.category)?.label || doc.category;
          const { data: signedData } = await supabase.storage
            .from("lead-images")
            .createSignedUrl(doc.file_path, 60 * 60 * 24 * 7);
          return {
            catLabel,
            fileName: doc.file_name,
            url: signedData?.signedUrl || null,
            memberId: doc.member_id,
          };
        })
      );

      // Group docs: general, by titular, by dependente
      const generalDocs = docsWithLinks.filter((d) => !d.memberId);
      const allMembers = membersHook.members;

      const formatDocLine = (d: typeof docsWithLinks[0]) =>
        d.url
          ? `   📎 ${d.catLabel}: ${d.fileName}\n   🔗 ${d.url}`
          : `   📎 ${d.catLabel}: ${d.fileName}`;

      // Build structured doc sections
      let docSections = "";

      if (generalDocs.length > 0) {
        docSections += `\n📄 *Documentos do Contrato:*\n${generalDocs.map(formatDocLine).join("\n")}\n`;
      }

      const titulares = allMembers.filter((m) => m.role === "titular");
      const dependentes = allMembers.filter((m) => m.role === "dependente");

      titulares.forEach((member, idx) => {
        const memberDocs = docsWithLinks.filter((d) => d.memberId === member.id);
        const label = titulares.length > 1 ? `Titular ${idx + 1}` : "Titular";
        docSections += `\n👤 *${label}: ${member.name}*${member.cpf ? ` (CPF: ${member.cpf})` : ""}\n`;
        if (memberDocs.length > 0) {
          docSections += memberDocs.map(formatDocLine).join("\n") + "\n";
        } else {
          docSections += "   _Sem documentos anexados_\n";
        }
      });

      dependentes.forEach((member, idx) => {
        const memberDocs = docsWithLinks.filter((d) => d.memberId === member.id);
        const label = dependentes.length > 1 ? `Dependente ${idx + 1}` : "Dependente";
        docSections += `\n👥 *${label}: ${member.name}*${member.vinculo ? ` (${member.vinculo})` : ""}${member.cpf ? ` — CPF: ${member.cpf}` : ""}\n`;
        if (memberDocs.length > 0) {
          docSections += memberDocs.map(formatDocLine).join("\n") + "\n";
        } else {
          docSections += "   _Sem documentos anexados_\n";
        }
      });

      // If no members at all, list all docs flat
      if (allMembers.length === 0 && generalDocs.length === 0) {
        docSections = `\n📄 *Documentos:*\n${docsWithLinks.map(formatDocLine).join("\n")}\n`;
      }

      // Build final message directly — no AI needed for structure
      const totalVidas = lead.lives && lead.lives > 1 ? `\n👥 *Vidas:* ${lead.lives}` : "";
      const emailLine = formData.emailTitular ? `\n📧 *E-mail:* ${formData.emailTitular}` : "";

      const message = `Bom dia! ☀️

Segue Proposta *${lead.type}* — *${lead.operator || "[Operadora]"}* para emissão:

━━━━━━━━━━━━━━━━━━━

🏢 *Corretora:* [preencher]
🧑‍💼 *Vendedor:* [preencher]

━━━━━━━━━━━━━━━━━━━

📋 *Plano:* ${formData.nomePlano}
📅 *Vigência desejada:* ${formData.vigencia}

👤 *Titular:* ${formData.nomeTitular}
📱 *Celular:* ${formData.celularTitular || lead.phone}${emailLine}${totalVidas}

━━━━━━━━━━━━━━━━━━━
${docSections}
━━━━━━━━━━━━━━━━━━━

⚠️ _Links válidos por 7 dias_

Atenciosamente 🤝`;

      setWhatsappMsg(message);
      setShowMsgDialog(true);
    } catch (e: any) {
      toast({ title: "Erro ao gerar mensagem", description: e.message, variant: "destructive" });
    }
    setGeneratingMsg(false);
  };




  const handleCopyMsg = async () => {
    await navigator.clipboard.writeText(whatsappMsg);
    setCopied(true);
    toast({ title: "Mensagem copiada!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWhatsApp = () => {
    const encoded = encodeURIComponent(whatsappMsg);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  const filteredNotes = obs.notes.filter((n: any) => {
    if (!noteSearch) return true;
    const q = noteSearch.toLowerCase();
    return (
      n.content.toLowerCase().includes(q) ||
      (n.tags || []).some((t: string) => t.includes(q)) ||
      n.category.toLowerCase().includes(q)
    );
  });


  return (
    <>
    <Tabs defaultValue="notes" className="w-full">
      <TabsList className="w-full grid grid-cols-3 h-9">
        <TabsTrigger value="notes" className="text-[10px] gap-1 px-1">
          <StickyNote className="h-3 w-3" /> Notas
        </TabsTrigger>
        <TabsTrigger value="docs" className="text-[10px] gap-1 px-1">
          <FileUp className="h-3 w-3" /> Docs
        </TabsTrigger>
        <TabsTrigger value="ai" className="text-[10px] gap-1 px-1">
          <Sparkles className="h-3 w-3" /> IA
        </TabsTrigger>
      </TabsList>

      {/* NOTAS */}
      <TabsContent value="notes" className="space-y-3 mt-3">
        <div className="space-y-2">
          <Textarea
            placeholder="Adicionar observação..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={3}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Select value={noteCategory} onValueChange={setNoteCategory}>
              <SelectTrigger className="h-7 text-[11px] w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={handleSaveNote} disabled={savingNote || !noteContent.trim()} className="flex-1 h-7 text-xs">
              {savingNote ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              Salvar Nota
            </Button>
          </div>
        </div>

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {obs.notes.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Nenhuma nota</p>}
          {obs.notes.map((note: any) => (
            <div key={note.id} className="p-2.5 rounded-lg border border-border bg-card space-y-1.5">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[9px]">
                  {NOTE_CATEGORIES.find((c) => c.value === note.category)?.label || note.category}
                </Badge>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground">
                    {format(new Date(note.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => obs.deleteNote(note.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
              <p className="text-xs whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="docs" className="space-y-3 mt-3">
        {/* Ações globais */}
        {obs.documents.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 gap-1.5 text-xs"
            disabled={downloadingAll}
            onClick={async () => {
              setDownloadingAll(true);
              try {
                const zip = new JSZip();
                for (const doc of obs.documents) {
                  const { data, error } = await supabase.storage.from("lead-images").download((doc as any).file_path);
                  if (!error && data) zip.file((doc as any).file_name, data);
                }
                const blob = await zip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `documentos_${lead.name.replace(/\s+/g, "_")}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                toast({ title: "Download concluído!" });
              } catch (e: any) {
                toast({ title: "Erro ao baixar", description: e.message, variant: "destructive" });
              }
              setDownloadingAll(false);
            }}
          >
            {downloadingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderDown className="h-3 w-3" />}
            Baixar todos ({obs.documents.length} arquivos)
          </Button>
        )}

        {obs.documents.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-8 gap-1.5 text-xs border-secondary/30 text-secondary hover:bg-secondary/10"
            disabled={generatingMsg}
            onClick={handleOpenEmissionForm}
          >
            {generatingMsg ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
            Montar mensagem para emissão
          </Button>
        )}

        {/* ─── Documentos Gerais (sem member_id) ─── */}
        <GeneralDocsSection
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

        {/* ─── Titulares ─── */}
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

        {/* ─── Dependentes ─── */}
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
      </TabsContent>


      {/* IA */}
      <TabsContent value="ai" className="space-y-3 mt-3">
        <Button onClick={handleGenerateSummary} disabled={loadingSummary} className="w-full gap-2 text-xs">
          {loadingSummary ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Gerar Resumo Inteligente
        </Button>
        {summary && (
          <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 prose prose-sm max-w-none">
            <div className="text-xs leading-relaxed [&>h1]:text-sm [&>h2]:text-xs [&>h3]:text-xs [&>p]:text-xs [&>ul]:text-xs [&>ol]:text-xs [&>li]:text-xs">
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          </div>
        )}
        {!summary && !loadingSummary && (
          <p className="text-xs text-muted-foreground text-center py-4">
            A IA vai analisar o histórico do lead (interações, notas e dados) para gerar um resumo executivo com próximos passos recomendados.
          </p>
        )}
      </TabsContent>
    </Tabs>

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={() => {
        if (previewDoc) URL.revokeObjectURL(previewDoc.url);
        setPreviewDoc(null);
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm truncate">{previewDoc?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto min-h-0">
            {previewDoc?.type?.startsWith("image/") ? (
              <img src={previewDoc.url} alt={previewDoc.name} className="w-full h-auto rounded-lg object-contain max-h-[70vh]" />
            ) : previewDoc?.type === "application/pdf" ? (
              <iframe src={previewDoc.url} className="w-full h-[70vh] rounded-lg border-0" title={previewDoc.name} />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <File className="h-12 w-12 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Pré-visualização não disponível para este tipo de arquivo</p>
                <Button size="sm" onClick={() => previewDoc && handleDownload(previewDoc.url, previewDoc.name)} className="gap-1">
                  <Download className="h-3 w-3" /> Baixar arquivo
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
            <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs" onClick={handleCopyMsg}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copiado!" : "Copiar"}
            </Button>
            <Button size="sm" className="flex-1 gap-1.5 text-xs bg-secondary hover:bg-secondary/90 text-secondary-foreground" onClick={handleSendWhatsApp}>
              <MessageCircle className="h-3 w-3" /> Abrir WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Emission Form Dialog */}
      <EmissionFormDialog
        open={showEmissionForm}
        onOpenChange={setShowEmissionForm}
        lead={lead}
        documentsCount={obs.documents.length}
        onConfirm={handleGenerateWhatsAppMsg}
        isLoading={generatingMsg}
      />
    </>
  );
}
