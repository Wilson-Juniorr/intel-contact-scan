import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Sparkles, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useVendorProfiles } from "@/hooks/useVendorProfiles";
import { useSalesTechniques } from "@/hooks/useSalesTechniques";
import { BuilderState, DEFAULT_BUILDER, generateSystemPrompt } from "@/lib/agents/promptBuilder";
import { StepIdentity } from "./builder/StepIdentity";
import { StepBrains } from "./builder/StepBrains";
import { StepTechniques } from "./builder/StepTechniques";
import { StepObjections } from "./builder/StepObjections";
import { StepPrice } from "./builder/StepPrice";
import { StepFlow } from "./builder/StepFlow";
import { StepRules } from "./builder/StepRules";
import { StepReview } from "./builder/StepReview";

const STEPS = [
  { key: "identity", title: "Identidade", desc: "Nome, tipo e persona em uma frase" },
  { key: "brains", title: "Cérebros", desc: "Quais especialistas formam esse agent" },
  { key: "techniques", title: "Técnicas", desc: "Quais métodos de venda ele usa" },
  { key: "objections", title: "Objeções", desc: "Como reage às objeções comuns" },
  { key: "price", title: "Preço", desc: "Política de falar sobre valores" },
  { key: "flow", title: "Fluxo", desc: "O que coletar do cliente" },
  { key: "rules", title: "Regras & Modelo", desc: "Limites duros e config técnica" },
  { key: "review", title: "Revisar & Salvar", desc: "Confira o prompt gerado" },
];

export function AgentBuilderWizard({
  open,
  onClose,
  agentSlug,
}: {
  open: boolean;
  onClose: (saved?: boolean) => void;
  agentSlug?: string | null;
}) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<BuilderState>(DEFAULT_BUILDER);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { profiles } = useVendorProfiles();
  const { techniques } = useSalesTechniques();

  const set = (p: Partial<BuilderState>) => setState((s) => ({ ...s, ...p }));

  // Load existing agent + brains/techs if editing
  useEffect(() => {
    if (!open) return;
    setStep(0);
    if (!agentSlug) { setState(DEFAULT_BUILDER); return; }
    (async () => {
      setLoading(true);
      const [a, av, at] = await Promise.all([
        supabase.from("agents_config").select("*").eq("slug", agentSlug).maybeSingle(),
        supabase.from("agent_vendor_profiles").select("*").eq("agent_slug", agentSlug),
        supabase.from("agent_techniques").select("*").eq("agent_slug", agentSlug),
      ]);
      if (a.data) {
        setState({
          ...DEFAULT_BUILDER,
          nome: a.data.nome,
          slug: a.data.slug,
          tipo: a.data.tipo as any,
          descricao: a.data.descricao || "",
          persona_resumo: a.data.descricao || "",
          modelo: a.data.modelo,
          temperature: Number(a.data.temperature),
          max_tokens: a.data.max_tokens,
          brains: (av.data || []).map((x: any) => ({ id: x.vendor_profile_id, peso: x.peso })),
          techniques: (at.data || []).map((x: any) => ({ id: x.technique_id, prioridade: x.prioridade })),
        });
      }
      setLoading(false);
    })();
  }, [open, agentSlug]);

  const canNext = (() => {
    if (step === 0) return state.nome.trim() && state.slug.trim() && state.persona_resumo.trim();
    return true;
  })();

  const save = async () => {
    setSaving(true);
    const system_prompt = generateSystemPrompt(state, profiles, techniques);
    const isEdit = !!agentSlug;

    // Get current to bump version if editing
    let versao = 1;
    if (isEdit) {
      const { data: cur } = await supabase.from("agents_config").select("versao, system_prompt, modelo").eq("slug", agentSlug).maybeSingle();
      if (cur) {
        const changed = cur.system_prompt !== system_prompt || cur.modelo !== state.modelo;
        versao = changed ? cur.versao + 1 : cur.versao;
        if (changed) {
          const { data: { user } } = await supabase.auth.getUser();
          await supabase.from("agents_config_history").insert({
            agent_slug: agentSlug,
            versao: cur.versao,
            system_prompt: cur.system_prompt,
            modelo: cur.modelo,
            motivo_mudanca: "atualização via Builder",
            criado_por: user?.id ?? null,
          });
        }
      }
    }

    const payload = {
      slug: state.slug,
      nome: state.nome,
      descricao: state.descricao,
      tipo: state.tipo,
      modelo: state.modelo,
      temperature: state.temperature,
      max_tokens: state.max_tokens,
      system_prompt,
      versao,
      ativo: true,
    };

    const { error } = isEdit
      ? await supabase.from("agents_config").update(payload).eq("slug", agentSlug)
      : await supabase.from("agents_config").insert(payload);

    if (error) { setSaving(false); toast.error("Erro: " + error.message); return; }

    // Sync brains
    await supabase.from("agent_vendor_profiles").delete().eq("agent_slug", state.slug);
    if (state.brains.length) {
      await supabase.from("agent_vendor_profiles").insert(state.brains.map((b) => ({ agent_slug: state.slug, vendor_profile_id: b.id, peso: b.peso })));
    }
    // Sync techniques
    await supabase.from("agent_techniques").delete().eq("agent_slug", state.slug);
    if (state.techniques.length) {
      await supabase.from("agent_techniques").insert(state.techniques.map((t) => ({ agent_slug: state.slug, technique_id: t.id, prioridade: t.prioridade })));
    }

    setSaving(false);
    toast.success(isEdit ? `Agent atualizado (v${versao})` : "Agent criado!");
    onClose(true);
  };

  const stepKey = STEPS[step].key;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {agentSlug ? `Editar ${state.nome || agentSlug}` : "Novo Agent"} — {STEPS[step].title}
          </DialogTitle>
          <DialogDescription>{STEPS[step].desc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Progress value={((step + 1) / STEPS.length) * 100} className="h-1" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Passo {step + 1} de {STEPS.length}</span>
            <span>{STEPS.map((s, i) => i === step ? `▶ ${s.title}` : null).filter(Boolean).join("")}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-3 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {stepKey === "identity" && <StepIdentity state={state} set={set} />}
              {stepKey === "brains" && <StepBrains state={state} set={set} />}
              {stepKey === "techniques" && <StepTechniques state={state} set={set} />}
              {stepKey === "objections" && <StepObjections state={state} set={set} />}
              {stepKey === "price" && <StepPrice state={state} set={set} />}
              {stepKey === "flow" && <StepFlow state={state} set={set} />}
              {stepKey === "rules" && <StepRules state={state} set={set} />}
              {stepKey === "review" && <StepReview state={state} />}
            </>
          )}
        </div>

        <DialogFooter className="border-t pt-3 flex-row justify-between sm:justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="bg-gradient-to-r from-primary to-blue-500">
              Avançar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={save} disabled={saving} className="bg-gradient-to-r from-primary to-blue-500">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Salvar agent</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}