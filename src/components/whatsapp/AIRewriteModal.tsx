import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, X, Zap, Scale, Flame, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TONES = [
  { id: "profissional", label: "Profissional", emoji: "👔" },
  { id: "humano", label: "Humano", emoji: "🤝" },
  { id: "direto", label: "Direto", emoji: "🎯" },
  { id: "persuasivo", label: "Persuasivo", emoji: "💡" },
  { id: "urgente", label: "Urgente", emoji: "⚡" },
  { id: "consultivo", label: "Consultivo", emoji: "📋" },
] as const;

const VARIANT_META = [
  { label: "Curta", icon: Zap, color: "text-emerald-400" },
  { label: "Equilibrada", icon: Scale, color: "text-sky-400" },
  { label: "Persuasiva", icon: Flame, color: "text-amber-400" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  currentText: string;
  onSelectVariant: (text: string) => void;
  leadId?: string | null;
  leadName?: string | null;
  leadStage?: string;
  leadType?: string;
  leadOperator?: string;
  leadLives?: number;
}

export default function AIRewriteModal({
  open,
  onClose,
  currentText,
  onSelectVariant,
  leadId,
  leadName,
  leadStage,
  leadType,
  leadOperator,
  leadLives,
}: Props) {
  const [objective, setObjective] = useState("");
  const [context, setContext] = useState("");
  const [tone, setTone] = useState("profissional");
  const [shortMode, setShortMode] = useState(false);
  const [naturalMode, setNaturalMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setVariants([]);
    setSelectedIdx(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Você precisa estar logado");
        return;
      }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rewrite-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          currentText,
          leadId: leadId || null,
          objective: objective.trim(),
          context: context.trim(),
          tone,
          shortMode,
          naturalMode,
          leadStage,
          leadType,
          leadOperator,
          leadLives,
          leadName,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro ao gerar variações" }));
        throw new Error(err.error || `Erro ${resp.status}`);
      }

      const data = await resp.json();
      if (data.variants && data.variants.length > 0) {
        setVariants(data.variants);
      } else {
        throw new Error("Nenhuma variação retornada");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUse = (idx: number) => {
    setSelectedIdx(idx);
    onSelectVariant(variants[idx]);
    setTimeout(() => onClose(), 300);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-lg mx-4 bg-[#1a2730] border border-[#2a3942] rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto"
          initial={{ y: 40, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a3942]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-400" />
              <span className="text-[14px] font-medium text-[#e9edef]">Melhorar com IA</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942]"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-4 space-y-4">
            {/* Original text preview */}
            <div className="bg-[#0b141a] rounded-lg p-3 border border-[#2a3942]">
              <p className="text-[11px] text-[#8696a0] mb-1">Texto original:</p>
              <p className="text-[13px] text-[#e9edef] whitespace-pre-wrap line-clamp-3">{currentText}</p>
            </div>

            {/* Objective */}
            <div className="space-y-1">
              <Label className="text-[12px] text-[#8696a0]">Objetivo</Label>
              <Input
                placeholder="Ex.: agendar ligação, pedir documentos, recuperar lead..."
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="h-8 text-[13px] bg-[#202c33] border-[#2a3942] text-[#e9edef] placeholder:text-[#8696a040]"
              />
            </div>

            {/* Context */}
            <div className="space-y-1">
              <Label className="text-[12px] text-[#8696a0]">Contexto rápido</Label>
              <Textarea
                placeholder="Ex.: pediu desconto, quer Hospital X, está com pressa..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={2}
                className="text-[13px] bg-[#202c33] border-[#2a3942] text-[#e9edef] placeholder:text-[#8696a040] min-h-[48px] resize-none"
              />
            </div>

            {/* Tone selector */}
            <div className="space-y-1.5">
              <Label className="text-[12px] text-[#8696a0]">Tom</Label>
              <div className="flex flex-wrap gap-1.5">
                {TONES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTone(t.id)}
                    className={`px-2.5 py-1 rounded-full text-[12px] transition-all ${
                      tone === t.id
                        ? "bg-[#00a884] text-[#111b21] font-medium"
                        : "bg-[#202c33] text-[#8696a0] hover:bg-[#2a3942] hover:text-[#e9edef]"
                    }`}
                  >
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="short"
                  checked={shortMode}
                  onCheckedChange={setShortMode}
                  className="data-[state=checked]:bg-[#00a884]"
                />
                <Label htmlFor="short" className="text-[12px] text-[#8696a0] cursor-pointer">
                  Curto (≤320 chars)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="natural"
                  checked={naturalMode}
                  onCheckedChange={setNaturalMode}
                  className="data-[state=checked]:bg-[#00a884]"
                />
                <Label htmlFor="natural" className="text-[12px] text-[#8696a0] cursor-pointer">
                  Sem parecer robô
                </Label>
              </div>
            </div>

            {/* Generate button */}
            <Button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full bg-[#00a884] hover:bg-[#06cf9c] text-[#111b21] font-medium gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading ? "Gerando variações..." : variants.length > 0 ? "Regenerar" : "Gerar variações"}
            </Button>

            {/* Variants */}
            <AnimatePresence>
              {variants.length > 0 && (
                <motion.div
                  className="space-y-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {variants.map((v, idx) => {
                    const meta = VARIANT_META[idx] || VARIANT_META[0];
                    const Icon = meta.icon;
                    const isSelected = selectedIdx === idx;
                    return (
                      <motion.div
                        key={idx}
                        className={`rounded-lg border p-3 transition-all ${
                          isSelected
                            ? "border-[#00a884] bg-[#00a884]/10"
                            : "border-[#2a3942] bg-[#0b141a] hover:border-[#3a4a52]"
                        }`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                            <span className={`text-[12px] font-medium ${meta.color}`}>{meta.label}</span>
                            <span className="text-[10px] text-[#8696a0]">({v.length} chars)</span>
                          </div>
                          <Button
                            size="sm"
                            variant={isSelected ? "default" : "outline"}
                            className={`h-6 text-[11px] px-2 gap-1 ${
                              isSelected
                                ? "bg-[#00a884] hover:bg-[#06cf9c] text-[#111b21] border-0"
                                : "border-[#2a3942] text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942]"
                            }`}
                            onClick={() => handleUse(idx)}
                          >
                            {isSelected ? <Check className="h-3 w-3" /> : null}
                            {isSelected ? "Selecionado" : "Usar esta"}
                          </Button>
                        </div>
                        <p className="text-[13px] text-[#e9edef] whitespace-pre-wrap leading-relaxed">{v}</p>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
