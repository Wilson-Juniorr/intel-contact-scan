import { useState, useRef } from "react";
import { LeadMember, VINCULO_OPTIONS } from "@/hooks/useLeadMembers";
import { DOC_CATEGORIES } from "@/hooks/useLeadObservations";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  ChevronDown, ChevronRight, User, Users, Plus, Trash2, Upload, Loader2,
  Eye, Download, File, Image as ImageIcon, X, Pencil, Check, UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface MemberDoc {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
  member_id: string | null;
}

interface Props {
  role: "titular" | "dependente";
  members: LeadMember[];
  documents: MemberDoc[];
  onAddMember: (m: { role: "titular" | "dependente"; name: string; vinculo?: string }) => Promise<unknown>;
  onDeleteMember: (id: string) => Promise<unknown>;
  onUpdateMember: (id: string, updates: Record<string, unknown>) => Promise<unknown>;
  onUploadDoc: (params: { file: File; category: string; memberId: string }) => Promise<unknown>;
  onDeleteDoc: (doc: { id: string; file_path: string }) => Promise<unknown>;
  onPreview: (filePath: string, fileName: string, fileType: string) => void;
  onDownload: (filePath: string, fileName: string) => void;
}

export function MemberSection({
  role, members, documents, onAddMember, onDeleteMember, onUpdateMember,
  onUploadDoc, onDeleteDoc, onPreview, onDownload,
}: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [addingName, setAddingName] = useState("");
  const [addingVinculo, setAddingVinculo] = useState("Cônjuge");
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const isTitular = role === "titular";
  const Icon = isTitular ? User : Users;
  const label = isTitular ? "Titulares" : "Dependentes";
  const accentClass = isTitular
    ? "from-primary/10 to-primary/5 border-primary/20"
    : "from-accent/10 to-accent/5 border-accent/20";

  const handleAdd = async () => {
    if (!addingName.trim()) return;
    setSaving(true);
    try {
      await onAddMember({
        role,
        name: addingName.trim(),
        ...(role === "dependente" ? { vinculo: addingVinculo } : {}),
      });
      setAddingName("");
      setShowAddForm(false);
      toast({ title: `${isTitular ? "Titular" : "Dependente"} adicionado!` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <div className={`rounded-lg border bg-gradient-to-b ${accentClass} overflow-hidden`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2.5 w-full px-3 py-2.5 hover:bg-accent/30 transition-colors">
          <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold tracking-wide flex-1 text-left">{label}</span>
          <Badge variant="secondary" className="text-[9px] font-medium tabular-nums">{members.length}</Badge>
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </motion.div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-2 pb-2 space-y-2">
            <AnimatePresence mode="popLayout">
              {members.map((member) => (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <MemberCard
                    member={member}
                    docs={documents.filter((d) => d.member_id === member.id)}
                    onDelete={() => onDeleteMember(member.id)}
                    onUpdate={onUpdateMember}
                    onUploadDoc={onUploadDoc}
                    onDeleteDoc={onDeleteDoc}
                    onPreview={onPreview}
                    onDownload={onDownload}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            <AnimatePresence>
              {showAddForm ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-lg border border-dashed border-primary/30 bg-card p-3 space-y-2.5"
                >
                  <Input
                    placeholder={`Nome do ${isTitular ? "titular" : "dependente"}`}
                    value={addingName}
                    onChange={(e) => setAddingName(e.target.value)}
                    className="h-8 text-xs"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  />
                  {role === "dependente" && (
                    <Select value={addingVinculo} onValueChange={setAddingVinculo}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Vínculo" />
                      </SelectTrigger>
                      <SelectContent>
                        {VINCULO_OPTIONS.map((v) => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs flex-1 gap-1" onClick={handleAdd} disabled={saving || !addingName.trim()}>
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowAddForm(false); setAddingName(""); }}>
                      Cancelar
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div layout>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full h-8 text-xs gap-1.5 border border-dashed border-muted-foreground/20 hover:border-primary/40 hover:bg-primary/5 transition-all"
                    onClick={() => setShowAddForm(true)}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Adicionar {isTitular ? "Titular" : "Dependente"}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/* ─── Individual Member Card ─── */

function MemberCard({
  member, docs, onDelete, onUpdate, onUploadDoc, onDeleteDoc, onPreview, onDownload,
}: {
  member: LeadMember;
  docs: MemberDoc[];
  onDelete: () => void;
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<unknown>;
  onUploadDoc: (p: { file: File; category: string; memberId: string }) => Promise<unknown>;
  onDeleteDoc: (doc: { id: string; file_path: string }) => Promise<unknown>;
  onPreview: (fp: string, fn: string, ft: string) => void;
  onDownload: (fp: string, fn: string) => void;
}) {
  const [cardOpen, setCardOpen] = useState(false);
  const [docCategory, setDocCategory] = useState("outros");
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(member.name);
  const [editCpf, setEditCpf] = useState(member.cpf || "");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await onUploadDoc({ file, category: docCategory, memberId: member.id });
      }
      toast({ title: `${files.length} arquivo(s) enviado(s)!` });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSaveEdit = async () => {
    try {
      await onUpdate(member.id, { name: editName.trim(), cpf: editCpf.trim() || null });
      setEditing(false);
      toast({ title: "Atualizado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      <Collapsible open={cardOpen} onOpenChange={setCardOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 hover:bg-accent/40 transition-colors">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-primary uppercase">
              {member.name.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-xs font-medium truncate">{member.name}</p>
            <div className="flex items-center gap-1.5">
              {member.vinculo && (
                <span className="text-[9px] text-muted-foreground">{member.vinculo}</span>
              )}
              {member.cpf && (
                <span className="text-[9px] text-muted-foreground font-mono">{member.cpf}</span>
              )}
            </div>
          </div>
          <Badge
            variant={docs.length > 0 ? "default" : "outline"}
            className="text-[9px] tabular-nums shrink-0"
          >
            {docs.length} doc{docs.length !== 1 ? "s" : ""}
          </Badge>
          <motion.div animate={{ rotate: cardOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </motion.div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Separator />
          <div className="p-3 space-y-3">
            {/* Edit / Actions */}
            <AnimatePresence mode="wait">
              {editing ? (
                <motion.div
                  key="edit"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  <Input placeholder="Nome" value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-xs" autoFocus />
                  <Input placeholder="CPF" value={editCpf} onChange={(e) => setEditCpf(e.target.value)} className="h-8 text-xs font-mono" />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs flex-1 gap-1" onClick={handleSaveEdit}>
                      <Check className="h-3 w-3" /> Salvar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
                      Cancelar
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px] gap-1 flex-1"
                    onClick={() => { setEditName(member.name); setEditCpf(member.cpf || ""); setEditing(true); }}
                  >
                    <Pencil className="h-3 w-3" /> Editar dados
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={onDelete}>
                    <Trash2 className="h-3 w-3" /> Remover
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Upload area */}
            <input ref={fileRef} type="file" multiple className="hidden" onChange={handleUpload} />
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

            {/* Doc list */}
            {docs.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-2">Nenhum documento anexado</p>
            )}
            <AnimatePresence>
              {docs.map((doc) => {
                const isImage = doc.file_type?.startsWith("image/");
                return (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="flex items-center gap-2.5 p-2 rounded-md border border-border bg-muted/30 hover:bg-muted/60 transition-colors group"
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
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onPreview(doc.file_path, doc.file_name, doc.file_type || "")}>
                        <Eye className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onDownload(doc.file_path, doc.file_name)}>
                        <Download className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onDeleteDoc({ id: doc.id, file_path: doc.file_path })}>
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
