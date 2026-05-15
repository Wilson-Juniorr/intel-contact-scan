import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, Mic, Volume2, AlertCircle, Plus, Bot } from "lucide-react";
import { toast } from "sonner";
import { AUDIO_TRIGGERS } from "@/lib/agents/juniorPrequalificador";

type AgentAudio = {
  id: string;
  agent_slug: string;
  trigger: string;
  descricao: string;
  audio_url: string;
  duracao_segundos: number | null;
  ativo: boolean;
  ordem: number;
};

type AgentOption = { slug: string; nome: string };

export function AgentsAudiosTab() {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [audios, setAudios] = useState<AgentAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [previewBlob, setPreviewBlob] = useState<Record<string, { url: string; blob: Blob; mime: string }>>({});
  const [newTriggerOpen, setNewTriggerOpen] = useState(false);
  const [newTrigger, setNewTrigger] = useState({ trigger: "", descricao: "" });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Carrega lista de agentes
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("agents_config")
        .select("slug, nome")
        .order("nome");
      if (error) {
        toast.error("Erro ao carregar agentes: " + error.message);
        setLoading(false);
        return;
      }
      const list = (data as AgentOption[]) || [];
      setAgents(list);
      if (list.length) {
        const junior = list.find(a => a.slug.includes("prequalificador") || a.slug.includes("junior"));
        setSelectedAgent(junior?.slug || list[0].slug);
      } else {
        setLoading(false);
      }
    })();
  }, []);

  // Carrega áudios do agente selecionado
  const loadAudios = useCallback(async (agentSlug: string) => {
    if (!agentSlug) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("agent_audios")
      .select("*")
      .eq("agent_slug", agentSlug)
      .order("ordem", { ascending: true });
    if (error) {
      toast.error("Erro ao carregar áudios: " + error.message);
    }
    setAudios((data as AgentAudio[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      loadAudios(selectedAgent);
    }
  }, [selectedAgent, loadAudios]);

  const onFile = async (audio: AgentAudio, file: File) => {
    if (!file) return;
    const allowed = [".ogg", ".mp3", ".m4a", ".opus", ".wav", ".webm"];
    const ok = allowed.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!ok) { toast.error("Formato inválido. Use .ogg, .mp3, .m4a, .opus, .wav ou .webm"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Áudio máx 5MB"); return; }

    setUploadingId(audio.id);
    try {
      const ext = file.name.split(".").pop();
      const path = `${audio.agent_slug}/${audio.trigger}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("agent-audios")
        .upload(path, file, { upsert: true, contentType: file.type || "audio/ogg" });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("agent-audios").getPublicUrl(path);

      let duracao: number | null = null;
      try {
        duracao = Math.round(await new Promise<number>((resolve, reject) => {
          const a = new Audio();
          a.preload = "metadata";
          a.onloadedmetadata = () => resolve(a.duration);
          a.onerror = () => reject(new Error("duration"));
          a.src = URL.createObjectURL(file);
        }));
      } catch { /* ignore */ }

      const { error: updErr } = await supabase
        .from("agent_audios")
        .update({ audio_url: pub.publicUrl, duracao_segundos: duracao })
        .eq("id", audio.id);
      if (updErr) throw updErr;

      toast.success("Áudio enviado!");
      await loadAudios(selectedAgent);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar áudio");
    } finally {
      setUploadingId(null);
    }
  };

  const toggleAtivo = async (audio: AgentAudio, ativo: boolean) => {
    if (ativo && !audio.audio_url) {
      toast.error("Faça upload do áudio antes de ativar");
      return;
    }
    const { error } = await supabase.from("agent_audios").update({ ativo }).eq("id", audio.id);
    if (error) { toast.error(error.message); return; }
    setAudios((prev) => prev.map((a) => a.id === audio.id ? { ...a, ativo } : a));
    toast.success(ativo ? "Áudio ativado" : "Áudio desativado");
  };

  const startRecording = async (audio: AgentAudio) => {
    if (recordingId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
      const mime = mimeCandidates.find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        setPreviewBlob((p) => ({ ...p, [audio.id]: { url, blob, mime: rec.mimeType || "audio/webm" } }));
      };
      rec.start();
      recorderRef.current = rec;
      setRecordingId(audio.id);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordSeconds((s) => {
          if (s + 1 >= 20) { stopRecording(); return s + 1; }
          return s + 1;
        });
      }, 1000);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível acessar o microfone");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { recorderRef.current?.state !== "inactive" && recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
    setRecordingId(null);
  };

  const discardPreview = (audioId: string) => {
    setPreviewBlob((p) => {
      const { [audioId]: removed, ...rest } = p;
      if (removed) URL.revokeObjectURL(removed.url);
      return rest;
    });
  };

  const savePreview = async (audio: AgentAudio) => {
    const pv = previewBlob[audio.id];
    if (!pv) return;
    const ext = pv.mime.includes("mp4") ? "m4a" : pv.mime.includes("ogg") ? "ogg" : "webm";
    const file = new File([pv.blob], `gravacao-${audio.trigger}.${ext}`, { type: pv.mime });
    await onFile(audio, file);
    discardPreview(audio.id);
  };

  const createTrigger = async () => {
    if (!newTrigger.trigger.trim() || !newTrigger.descricao.trim()) {
      toast.error("Preencha trigger e descrição");
      return;
    }
    if (!selectedAgent) {
      toast.error("Selecione um agente primeiro");
      return;
    }
    const { error } = await supabase.from("agent_audios").insert({
      agent_slug: selectedAgent,
      trigger: newTrigger.trigger.trim().toLowerCase().replace(/\s+/g, "_"),
      descricao: newTrigger.descricao.trim(),
      ordem: audios.length + 1,
      ativo: false,
      audio_url: "",
    });
    if (error) { toast.error("Erro ao criar trigger: " + error.message); return; }
    toast.success("Trigger criado!");
    setNewTriggerOpen(false);
    setNewTrigger({ trigger: "", descricao: "" });
    loadAudios(selectedAgent);
  };

  const triggerHint = (trigger: string) => AUDIO_TRIGGERS.find(t => t.trigger === trigger);

  // Estado: carregando
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Carregando áudios...</p>
      </div>
    );
  }

  // Estado: nenhum agente ativo
  if (agents.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
        Nenhum agente ativo encontrado. Crie um agente na tab Configuração primeiro.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/80 to-blue-500 flex items-center justify-center">
            <Mic className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Áudios do Agente</h2>
            <p className="text-xs text-muted-foreground">
              Áudios pré-gravados disparados nos momentos certos da conversa via WhatsApp (PTT).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue placeholder="Selecione agente" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.slug} value={a.slug}>
                  <span className="flex items-center gap-2"><Bot className="h-3 w-3" />{a.nome}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setNewTriggerOpen(true)} className="btn-press">
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo trigger
          </Button>
        </div>
      </div>

      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-3 flex gap-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            Grave em ambiente silencioso, no celular, fala natural como WhatsApp normal. Máx 15s.
            Cada áudio fica desativado até você gravar, ouvir o preview e ativar.
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {audios.map((a) => {
          const hint = triggerHint(a.trigger);
          return (
            <Card key={a.id} className="hover-card-lift border-border/50">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant="outline" className="font-mono text-[10px]">{a.trigger}</Badge>
                      {a.duracao_segundos != null && (
                        <Badge variant="secondary" className="text-[10px]">{a.duracao_segundos}s</Badge>
                      )}
                      {!a.audio_url && <Badge variant="destructive" className="text-[10px]">Sem áudio</Badge>}
                      {hint && <span className="text-[10px] text-muted-foreground">ideal: {hint.duracao_ideal}</span>}
                    </div>
                    <p className="text-sm font-semibold">{a.descricao}</p>
                    {hint && (
                      <>
                        <p className="text-[11px] text-muted-foreground mt-1">Quando: {hint.quando}</p>
                        <p className="text-[11px] text-muted-foreground italic mt-1">Script: "{hint.script_sugerido}"</p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground">{a.ativo ? "Ativo" : "Inativo"}</span>
                    <Switch checked={a.ativo} onCheckedChange={(v) => toggleAtivo(a, v)} />
                  </div>
                </div>

                {a.audio_url && (
                  <div className="flex items-center gap-2 p-2 rounded bg-muted/40">
                    <Volume2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <audio controls src={a.audio_url} className="w-full h-8" />
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    ref={(el) => { fileInputs.current[a.id] = el; }}
                    type="file"
                    accept="audio/ogg,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/webm,.ogg,.mp3,.m4a,.opus,.wav"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onFile(a, f);
                      e.target.value = "";
                    }}
                  />
                  <Button size="sm" variant="outline" onClick={() => fileInputs.current[a.id]?.click()} disabled={uploadingId === a.id}>
                    {uploadingId === a.id
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Enviando…</>
                      : <><Upload className="h-3.5 w-3.5 mr-1.5" /> {a.audio_url ? "Substituir" : "Enviar áudio"}</>}
                  </Button>
                  {recordingId === a.id ? (
                    <Button size="sm" variant="destructive" onClick={stopRecording}>
                      <Mic className="h-3.5 w-3.5 mr-1.5 animate-pulse" /> Parar ({recordSeconds}s)
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => startRecording(a)} disabled={!!recordingId || uploadingId === a.id}>
                      <Mic className="h-3.5 w-3.5 mr-1.5" /> Gravar
                    </Button>
                  )}
                </div>

                {previewBlob[a.id] && (
                  <div className="space-y-2 p-2 rounded border border-primary/30 bg-primary/5">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <audio controls src={previewBlob[a.id].url} className="w-full h-8" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => savePreview(a)} disabled={uploadingId === a.id}>
                        {uploadingId === a.id ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Salvando…</> : <>Usar esta gravação</>}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => discardPreview(a.id)}>Regravar</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {audios.length === 0 && (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum áudio configurado para este agente. Clique em "Novo trigger" para começar.
          </CardContent></Card>
        )}
      </div>

      {/* Dialog novo trigger */}
      <Dialog open={newTriggerOpen} onOpenChange={setNewTriggerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Trigger de Áudio</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Trigger (identificador)</Label>
              <Input
                value={newTrigger.trigger}
                onChange={(e) => setNewTrigger(t => ({ ...t, trigger: e.target.value }))}
                placeholder="ex: apresentacao, follow_up_dia3"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Sem espaços, use underline</p>
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea
                value={newTrigger.descricao}
                onChange={(e) => setNewTrigger(t => ({ ...t, descricao: e.target.value }))}
                placeholder="Quando e por que esse áudio é enviado"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTriggerOpen(false)}>Cancelar</Button>
            <Button onClick={createTrigger}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
