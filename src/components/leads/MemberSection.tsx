import { useState, useRef } from "react";
import { LeadMember, VINCULO_OPTIONS } from "@/hooks/useLeadMembers";
import { DOC_CATEGORIES } from "@/hooks/useLeadObservations";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronDown, ChevronRight, User, Users, Plus, Trash2, Upload, Loader2,
  Eye, Download, File, Image as ImageIcon, X, Pencil, Check,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

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
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 hover:bg-accent/50 rounded px-1 transition-colors">
        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">{label}</span>
        <Badge variant="secondary" className="text-[9px] ml-auto">{members.length}</Badge>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-2 pl-2 mt-1">
        {members.map((member) => (
          <MemberCard
            key={member.id}
            member={member}
            docs={documents.filter((d) => d.member_id === member.id)}
            onDelete={() => onDeleteMember(member.id)}
            onUpdate={onUpdateMember}
            onUploadDoc={onUploadDoc}
            onDeleteDoc={onDeleteDoc}
            onPreview={onPreview}
            onDownload={onDownload}
          />
        ))}

        {showAddForm ? (
          <div className="p-2 rounded border border-dashed border-border space-y-2">
            <Input
              placeholder={`Nome do ${isTitular ? "titular" : "dependente"}`}
              value={addingName}
              onChange={(e) => setAddingName(e.target.value)}
              className="h-7 text-xs"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            {role === "dependente" && (
              <Select value={addingVinculo} onValueChange={setAddingVinculo}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VINCULO_OPTIONS.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex gap-1">
              <Button size="sm" className="h-6 text-[10px] flex-1" onClick={handleAdd} disabled={saving || !addingName.trim()}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-0.5" />}
                Salvar
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => { setShowAddForm(false); setAddingName(""); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="w-full h-7 text-[10px] gap-1 border border-dashed border-border" onClick={() => setShowAddForm(true)}>
            <Plus className="h-3 w-3" /> Adicionar {isTitular ? "Titular" : "Dependente"}
          </Button>
        )}
      </CollapsibleContent>
    </Collapsible>
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
  const [cardOpen, setCardOpen] = useState(true);
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
    <Collapsible open={cardOpen} onOpenChange={setCardOpen}>
      <div className="rounded-lg border border-border bg-card">
        <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 hover:bg-accent/30 rounded-t-lg transition-colors">
          {cardOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="text-xs font-medium truncate flex-1 text-left">{member.name}</span>
          {member.vinculo && <Badge variant="outline" className="text-[9px]">{member.vinculo}</Badge>}
          {member.cpf && <span className="text-[9px] text-muted-foreground">{member.cpf}</span>}
          <Badge variant="secondary" className="text-[9px]">{docs.length} doc(s)</Badge>
        </CollapsibleTrigger>

        <CollapsibleContent className="p-2 pt-0 space-y-2">
          {editing ? (
            <div className="space-y-1.5 pt-1">
              <Input placeholder="Nome" value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 text-xs" />
              <Input placeholder="CPF" value={editCpf} onChange={(e) => setEditCpf(e.target.value)} className="h-7 text-xs" />
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-[10px] flex-1" onClick={handleSaveEdit}><Check className="h-3 w-3 mr-0.5" /> Salvar</Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setEditing(false)}><X className="h-3 w-3" /></Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1 pt-1">
              <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1" onClick={() => { setEditName(member.name); setEditCpf(member.cpf || ""); setEditing(true); }}>
                <Pencil className="h-3 w-3" /> Editar
              </Button>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3" /> Remover
              </Button>
            </div>
          )}

          {/* Upload area */}
          <input ref={fileRef} type="file" multiple className="hidden" onChange={handleUpload} />
          <div className="flex gap-1">
            <Select value={docCategory} onValueChange={setDocCategory}>
              <SelectTrigger className="h-7 text-[10px] flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOC_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              Enviar
            </Button>
          </div>

          {/* Doc list */}
          {docs.map((doc) => {
            const isImage = doc.file_type?.startsWith("image/");
            return (
              <div key={doc.id} className="flex items-center gap-2 p-1.5 rounded border border-border bg-muted/30">
                <div className="h-6 w-6 rounded bg-muted flex items-center justify-center shrink-0">
                  {isImage ? <ImageIcon className="h-3 w-3 text-muted-foreground" /> : <File className="h-3 w-3 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium truncate">{doc.file_name}</p>
                  <Badge variant="outline" className="text-[8px]">
                    {DOC_CATEGORIES.find((c) => c.value === doc.category)?.label || doc.category}
                  </Badge>
                </div>
                <div className="flex gap-0.5">
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onPreview(doc.file_path, doc.file_name, doc.file_type || "")}>
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onDownload(doc.file_path, doc.file_name)}>
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => onDeleteDoc({ id: doc.id, file_path: doc.file_path })}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
