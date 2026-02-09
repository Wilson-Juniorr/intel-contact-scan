import { useState, useRef } from "react";
import { useLeadObservations, NOTE_CATEGORIES, DOC_CATEGORIES } from "@/hooks/useLeadObservations";
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
  MessageCircle, Copy, Check,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import ReactMarkdown from "react-markdown";
import JSZip from "jszip";
import { EmissionFormDialog } from "./EmissionFormDialog";

interface Props {
  lead: Lead;
}

export function LeadObservationsPanel({ lead }: Props) {
  const { getLeadInteractions } = useLeadsContext();
  const obs = useLeadObservations(lead.id);

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

  const handleGenerateWhatsAppMsg = async (formData: { vigencia: string; nomePlano: string; nomeTitular: string; emailTitular: string }) => {
    setShowEmissionForm(false);
    setGeneratingMsg(true);
    setWhatsappMsg("");
    setCopied(false);
    try {
      const docsWithLinks = await Promise.all(
        obs.documents.map(async (doc: any) => {
          const catLabel = DOC_CATEGORIES.find((c) => c.value === doc.category)?.label || doc.category;
          const { data: signedData } = await supabase.storage
            .from("lead-images")
            .createSignedUrl(doc.file_path, 60 * 60 * 24 * 7);
          return { catLabel, fileName: doc.file_name, url: signedData?.signedUrl || null };
        })
      );

      const docList = docsWithLinks.map((d) =>
        d.url ? `- ${d.catLabel}: ${d.fileName}\n  🔗 Link: ${d.url}` : `- ${d.catLabel}: ${d.fileName}`
      ).join("\n");

      const prompt = `Gere uma mensagem profissional e organizada para enviar via WhatsApp ao time de emissão de um plano de saúde/odonto.

Use EXATAMENTE este formato de referência (adapte os dados):

---
Bom dia!

Segue Proposta ${lead.type} ${lead.operator || "Operadora"} para emissão:

Corretora: [deixe para o corretor preencher]
Vendedor: [deixe para o corretor preencher]

Plano: ${formData.nomePlano}
Vigência desejada: ${formData.vigencia}

Titular: ${formData.nomeTitular}
Celular: ${lead.phone}
${formData.emailTitular ? `E-mail: ${formData.emailTitular}` : ""}
${lead.lives && lead.lives > 1 ? `Vidas: ${lead.lives}` : ""}

Documentos anexados:
${docList}

Atenciosamente,
---

Regras:
1. Mantenha o formato acima, limpo e profissional
2. Inclua TODOS os documentos listados com seus links de download
3. Use emojis moderadamente apenas para organização visual
4. Os links são temporários (7 dias)
5. A mensagem deve ser pronta para copiar e colar no WhatsApp
6. Inclua os campos "Corretora" e "Vendedor" com marcação [preencher] para o corretor completar depois`;

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          crmContext: "",
        }),
      });

      if (!resp.ok) throw new Error("Erro ao gerar mensagem");

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let fullMsg = "";

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
            if (content) {
              fullMsg += content;
              setWhatsappMsg(fullMsg);
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

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
            <div className="flex-1 flex gap-1">
              <Input
                placeholder="Tag..."
                value={noteTagInput}
                onChange={(e) => setNoteTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                className="h-7 text-[11px]"
              />
              <Button size="sm" variant="ghost" onClick={addTag} className="h-7 px-2">
                <Tag className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {noteTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {noteTags.map((t) => (
                <Badge key={t} variant="secondary" className="text-[10px] gap-1 cursor-pointer" onClick={() => setNoteTags((prev) => prev.filter((x) => x !== t))}>
                  {t} <X className="h-2.5 w-2.5" />
                </Badge>
              ))}
            </div>
          )}
          <Button size="sm" onClick={handleSaveNote} disabled={savingNote || !noteContent.trim()} className="w-full h-7 text-xs">
            {savingNote ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
            Salvar Nota
          </Button>
        </div>

        <Input placeholder="Buscar notas..." value={noteSearch} onChange={(e) => setNoteSearch(e.target.value)} className="h-7 text-[11px]" />

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {filteredNotes.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Nenhuma nota</p>}
          {filteredNotes.map((note: any) => (
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
              {note.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {note.tags.map((t: string) => (
                    <Badge key={t} variant="secondary" className="text-[9px]">{t}</Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </TabsContent>

      {/* DOCUMENTOS */}
      <TabsContent value="docs" className="space-y-3 mt-3">
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
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="h-8 gap-1 text-xs">
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Enviar
          </Button>
        </div>

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

        <div className="space-y-2 max-h-[350px] overflow-y-auto">
          {obs.documents.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">Nenhum documento</p>}
          {obs.documents.map((doc: any) => {
            const isImage = doc.file_type?.startsWith("image/");
            return (
              <div key={doc.id} className="p-2.5 rounded-lg border border-border bg-card flex items-center gap-2.5">
                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                  {isImage ? <ImageIcon className="h-4 w-4 text-muted-foreground" /> : <File className="h-4 w-4 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{doc.file_name}</p>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[9px]">
                      {DOC_CATEGORIES.find((c) => c.value === doc.category)?.label || doc.category}
                    </Badge>
                    <span className="text-[9px] text-muted-foreground">
                      {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)}KB` : ""}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handlePreview(doc.file_path, doc.file_name, doc.file_type || "")}>
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDownload(doc.file_path, doc.file_name)}>
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => obs.deleteDocument({ id: doc.id, file_path: doc.file_path })}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
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
