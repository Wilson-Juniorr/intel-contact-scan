import { useState } from "react";
import { useLeadObservations, NOTE_CATEGORIES } from "@/hooks/useLeadObservations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  leadId: string;
  obs: ReturnType<typeof useLeadObservations>;
}

export function NotesTab({ leadId, obs }: Props) {
  const [noteContent, setNoteContent] = useState("");
  const [noteCategory, setNoteCategory] = useState("geral");
  const [noteTagInput, setNoteTagInput] = useState("");
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [savingNote, setSavingNote] = useState(false);

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
      toast.success("Nota salva!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar nota");
    }
    setSavingNote(false);
  };

  return (
    <div className="space-y-3">
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
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleSaveNote}
            disabled={savingNote || !noteContent.trim()}
            className="flex-1 h-7 text-xs"
          >
            {savingNote ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Plus className="h-3 w-3 mr-1" />
            )}
            Salvar Nota
          </Button>
        </div>
      </div>

      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {obs.notes.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">Nenhuma nota</p>
        )}
        {obs.notes.map((note) => (
          <div key={note.id} className="p-2.5 rounded-lg border border-border bg-card space-y-1.5">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[9px]">
                {NOTE_CATEGORIES.find((c) => c.value === note.category)?.label || note.category}
              </Badge>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground">
                  {format(new Date(note.created_at), "dd/MM HH:mm", { locale: ptBR })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0"
                  onClick={() => obs.deleteNote(note.id)}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
            <p className="text-xs whitespace-pre-wrap">{note.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
