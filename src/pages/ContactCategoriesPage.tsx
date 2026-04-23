import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

const CATEGORIES = [
  { value: "lead_novo", label: "🎯 Lead novo" },
  { value: "lead_retorno", label: "🔄 Lead retorno" },
  { value: "personal", label: "👨‍👩 Pessoal" },
  { value: "team", label: "👥 Equipe" },
  { value: "partner", label: "🤝 Parceiro/Operadora" },
  { value: "vendor", label: "🛠️ Fornecedor" },
  { value: "spam", label: "🚫 Spam" },
  { value: "ambiguo", label: "❓ Ambíguo" },
];

type Contact = {
  id: string;
  phone: string;
  contact_name: string | null;
  category: string | null;
  category_source: string | null;
};

export default function ContactCategoriesPage() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<"uncategorized" | "llm" | "all">("uncategorized");
  const [loading, setLoading] = useState(true);
  const [classifyingId, setClassifyingId] = useState<string | null>(null);

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, user]);

  async function load() {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from("whatsapp_contacts")
      .select("id, phone, contact_name, category, category_source")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (filter === "uncategorized") q = q.is("category", null);
    if (filter === "llm") q = q.eq("category_source", "llm");
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setContacts((data || []) as Contact[]);
    setLoading(false);
  }

  async function setCategory(id: string, category: string) {
    const { error } = await supabase
      .from("whatsapp_contacts")
      .update({
        category: category as any,
        category_source: "manual",
        category_classified_at: new Date().toISOString(),
        category_confidence: 1.0,
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Categoria salva");
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, category, category_source: "manual" } : c)),
    );
  }

  async function classifyOne(c: Contact) {
    if (!user) return;
    setClassifyingId(c.id);
    try {
      const { data, error } = await supabase.functions.invoke("classify-conversation", {
        body: { phone: c.phone, user_id: user.id, force_reclassify: true },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "falha");
      toast.success(`Classificado: ${data.categoria} (${Math.round(Number(data.confianca) * 100)}%)`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setClassifyingId(null);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Categorias de contato</h1>
          <p className="text-sm text-muted-foreground">
            A Camila só responde contatos marcados como <strong>lead</strong>. Os demais ficam silenciados.
          </p>
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="uncategorized">Só não categorizados</SelectItem>
            <SelectItem value="llm">Categorizados pela IA</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => (
            <Card key={c.id} className="p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <p className="font-medium text-sm">{c.contact_name || c.phone}</p>
                <p className="text-xs text-muted-foreground">
                  {c.phone}
                  {c.category_source === "llm" && (
                    <Badge variant="secondary" className="ml-2 text-[10px] py-0 h-4">IA</Badge>
                  )}
                  {c.category_source === "manual" && (
                    <Badge variant="default" className="ml-2 text-[10px] py-0 h-4">manual</Badge>
                  )}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => classifyOne(c)}
                disabled={classifyingId === c.id}
              >
                {classifyingId === c.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
              </Button>
              <Select
                value={c.category ?? undefined}
                onValueChange={(v) => setCategory(c.id, v)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Card>
          ))}
          {contacts.length === 0 && (
            <p className="text-sm text-muted-foreground">Nada pra categorizar.</p>
          )}
        </div>
      )}
    </div>
  );
}