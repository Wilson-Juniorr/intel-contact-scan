import { useState, useRef } from "react";
import { useLeadObservations, DOC_CATEGORIES } from "@/hooks/useLeadObservations";
import { useLeadMembers } from "@/hooks/useLeadMembers";
import { Lead } from "@/types/lead";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  Upload,
  Loader2,
  Download,
  File,
  Image as ImageIcon,
  Eye,
  FolderDown,
  MessageCircle,
  FileText,
  ChevronDown,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import JSZip from "jszip";
import { EmissionFormDialog } from "../EmissionFormDialog";
import { MemberSection } from "../MemberSection";

interface Props {
  lead: Lead;
  obs: ReturnType<typeof useLeadObservations>;
  membersHook: ReturnType<typeof useLeadMembers>;
}

export function DocumentsTab({ lead, obs, membersHook }: Props) {
  const [docCategory, setDocCategory] = useState("outros");
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string; type: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const [whatsappMsg, setWhatsappMsg] = useState("");
  const [showMsgDialog, setShowMsgDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEmissionForm, setShowEmissionForm] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await obs.uploadDocument({ file, category: docCategory });
      }
      toast.success(`${files.length} arquivo(s) enviado(s)!`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar");
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from("lead-images").download(filePath);
    if (error) {
      toast.error("Erro ao baixar");
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
      toast.error("Erro ao visualizar");
      return;
    }
    const url = URL.createObjectURL(data);
    setPreviewDoc({ url, name: fileName, type: fileType });
  };

  const handleOpenEmissionForm = () => {
    if (!obs.documents.length) {
      toast.error("Adicione documentos antes de gerar a mensagem.");
      return;
    }
    setShowEmissionForm(true);
  };

  const handleGenerateWhatsAppMsg = async (formData: {
    vigencia: string;
    nomePlano: string;
    nomeTitular: string;
    emailTitular: string;
    celularTitular: string;
  }) => {
    setShowEmissionForm(false);
    setGeneratingMsg(true);
    setWhatsappMsg("");
    setCopied(false);
    try {
      const docsWithLinks = await Promise.all(
        obs.documents.map(async (doc) => {
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

      const generalDocs = docsWithLinks.filter((d) => !d.memberId);
      const allMembers = membersHook.members;

      const formatDocLine = (d: (typeof docsWithLinks)[0]) =>
        d.url
          ? `   📎 ${d.catLabel}: ${d.fileName}\n   🔗 ${d.url}`
          : `   📎 ${d.catLabel}: ${d.fileName}`;

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
        docSections += memberDocs.length > 0 ? memberDocs.map(formatDocLine).join("\n") + "\n" : "   _Sem documentos anexados_\n";
      });

      dependentes.forEach((member, idx) => {
        const memberDocs = docsWithLinks.filter((d) => d.memberId === member.id);
        const label = dependentes.length > 1 ? `Dependente ${idx + 1}` : "Dependente";
        docSections += `\n👥 *${label}: ${member.name}*${member.vinculo ? ` (${member.vinculo})` : ""}${member.cpf ? ` — CPF: ${member.cpf}` : ""}\n`;
        docSections += memberDocs.length > 0 ? memberDocs.map(formatDocLine).join("\n") + "\n" : "   _Sem documentos anexados_\n";
      });

      if (allMembers.length === 0 && generalDocs.length === 0) {
        docSections = `\n📄 *Documentos:*\n${docsWithLinks.map(formatDocLine).join("\n")}\n`;
      }

      const totalVidas = lead.lives && lead.lives > 1 ? `\n👥 *Vidas:* ${lead.lives}` : "";
      const emailLine = formData.emailTitular ? `\n📧 *E-mail:* ${formData.emailTitular}` : "";

      const message = `Bom dia! ☀️\n\nSegue Proposta *${lead.type}* — *${lead.operator || "[Operadora]"}* para emissão:\n\n━━━━━━━━━━━━━━━━━━━\n\n🏢 *Corretora:* [preencher]\n🧑‍💼 *Vendedor:* [preencher]\n\n━━━━━━━━━━━━━━━━━━━\n\n📋 *Plano:* ${formData.nomePlano}\n📅 *Vigência desejada:* ${formData.vigencia}\n\n👤 *Titular:* ${formData.nomeTitular}\n📱 *Celular:* ${formData.celularTitular || lead.phone}${emailLine}${totalVidas}\n\n━━━━━━━━━━━━━━━━━━━\n${docSections}\n━━━━━━━━━━━━━━━━━━━\n\n⚠️ _Links válidos por 7 dias_\n\nAtenciosamente 🤝`;

      setWhatsappMsg(message);
      setShowMsgDialog(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar mensagem");
    }
    setGeneratingMsg(false);
  };

  const handleCopyMsg = async () => {
    await navigator.clipboard.writeText(whatsappMsg);
    setCopied(true);
    toast.success("Mensagem copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div className="space-y-3">
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
                  const { data, error } = await supabase.storage.from("lead-images").download(doc.file_path);
                  if (!error && data) zip.file(doc.file_name, data);
                }
                const blob = await zip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `documentos_${lead.name.replace(/\s+/g, "_")}.zip`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success("Download concluído!");
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : "Erro");
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

        {/* General docs */}
        <GeneralDocsSection
          documents={obs.documents.filter((d) => !d.member_id)}
          docCategory={docCategory}
          setDocCategory={setDocCategory}
          fileRef={fileRef}
          uploading={uploading}
          handleFileUpload={handleFileUpload}
          handlePreview={handlePreview}
          handleDownload={handleDownload}
          onDeleteDoc={(doc) => obs.deleteDocument({ id: doc.id, file_path: doc.file_path })}
        />

        <MemberSection
          role="titular"
          members={membersHook.titulares}
          documents={obs.documents}
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
          documents={obs.documents}
          onAddMember={membersHook.addMember}
          onDeleteMember={membersHook.deleteMember}
          onUpdateMember={membersHook.updateMember}
          onUploadDoc={async (p) => obs.uploadDocument({ file: p.file, category: p.category, memberId: p.memberId })}
          onDeleteDoc={(doc) => obs.deleteDocument({ id: doc.id, file_path: doc.file_path })}
          onPreview={handlePreview}
          onDownload={handleDownload}
        />
      </div>

      {/* Preview Dialog */}
      <Dialog
        open={!!previewDoc}
        onOpenChange={() => {
          if (previewDoc) URL.revokeObjectURL(previewDoc.url);
          setPreviewDoc(null);
        }}
      >
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
            <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs" onClick={handleCopyMsg}>
              {copied ? "Copiado!" : "Copiar"}
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1.5 text-xs bg-secondary hover:bg-secondary/90 text-secondary-foreground"
              onClick={() => {
                const encoded = encodeURIComponent(whatsappMsg);
                window.open(`https://wa.me/?text=${encoded}`, "_blank");
              }}
            >
              <MessageCircle className="h-3 w-3" /> Abrir WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

/* ─── General Docs Section ─── */
function GeneralDocsSection({
  documents,
  docCategory,
  setDocCategory,
  fileRef,
  uploading,
  handleFileUpload,
  handlePreview,
  handleDownload,
  onDeleteDoc,
}: {
  documents: { id: string; file_name: string; file_path: string; file_type: string | null; category: string }[];
  docCategory: string;
  setDocCategory: (v: string) => void;
  fileRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handlePreview: (fp: string, fn: string, ft: string) => void;
  handleDownload: (fp: string, fn: string) => void;
  onDeleteDoc: (doc: { id: string; file_path: string }) => void;
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
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
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
            {documents.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-2">Nenhum documento geral</p>
            )}
            <AnimatePresence>
              {documents.map((doc) => {
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
                        {DOC_CATEGORIES.find((c) => c.value === doc.category)?.label || doc.category}
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
