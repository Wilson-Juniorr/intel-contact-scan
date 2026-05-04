import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Mic, Volume2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

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

const TRIGGER_HINTS: Record<string, { quando: string; script: string; duracao: string }> = {
  apresentacao: {
    quando: "Turn 2, quando o lead respondeu com 5+ palavras (engajado)",
    script: "\"Oi… Aqui é o Junior mesmo. Sou consultor de planos de saúde há anos aqui em SP. Trabalho com as principais operadoras e vou te ajudar a achar a melhor opção. Me conta mais um pouco…\"",
    duracao: "8-12s",
  },
  entendimento: {
    quando: "Quando 4+ campos do coletado estão preenchidos",
    script: "\"Perfeito… Já entendi sua situação. Com esses dados eu já consigo montar as opções certas pra você, sem desperdiçar seu tempo. Já estou verificando…\"",
    duracao: "8-12s",
  },
  qualificacao_completa: {
    quando: "Quando deve_transferir_junior = true (qualificou)",
    script: "\"Oi! Já tenho tudo que precisava. Vou montar as melhores opções pro seu perfil agora e te mando ainda hoje. Qualquer dúvida pode falar!\"",
    duracao: "8-10s",
  },
  follow_up_dia2: {
    quando: "Lead sem resposta há 24-48h",
    script: "\"Oi! Aqui é o Junior. Vi que a gente estava conversando sobre o plano. Fica à vontade pra continuar quando puder, tô aqui.\"",
    duracao: "6-8s",
  },
  follow_up_dia5: {
    quando: "Lead sem resposta há 4-5 dias",
    script: "\"Oi! Junior aqui. Tô com algumas novidades de tabela que podem ser interessantes pro seu perfil. Quando quiser continuar é só falar.\"",
    duracao: "8-10s",
  },
};

export function AgentsAudiosTab() {
  const [audios, setAudios] = useState<AgentAudio[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [previewBlob, setPreviewBlob] = useState<Record<string, { url: string; blob: Blob; mime: string }>>({});
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("agent_audios")
      .select("*")
      .eq("agent_slug", "sdr-qualificador")
      .order("ordem", { ascending: true });
    if (error) toast.error(error.message);
    setAudios((data as AgentAudio[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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

      // try to read duration
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
      await load();
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
          if (s + 1 >= 20) {
            stopRecording();
            return s + 1;
          }
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
      const { [audioId]: _, ...rest } = p;
      if (_) URL.revokeObjectURL(_.url);
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

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/80 to-blue-500 flex items-center justify-center">
          <Mic className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Áudios do Junior</h2>
          <p className="text-xs text-muted-foreground">
            Áudios pré-gravados disparados nos momentos certos da conversa via WhatsApp (PTT).
          </p>
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
          const hint = TRIGGER_HINTS[a.trigger];
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
                      {hint && <span className="text-[10px] text-muted-foreground">ideal: {hint.duracao}</span>}
                    </div>
                    <p className="text-sm font-semibold">{a.descricao}</p>
                    {hint && (
                      <>
                        <p className="text-[11px] text-muted-foreground mt-1">📅 {hint.quando}</p>
                        <p className="text-[11px] text-muted-foreground italic mt-1">📝 {hint.script}</p>
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

                <div className="flex items-center gap-2">
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputs.current[a.id]?.click()}
                    disabled={uploadingId === a.id}
                  >
                    {uploadingId === a.id
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Enviando…</>
                      : <><Upload className="h-3.5 w-3.5 mr-1.5" /> {a.audio_url ? "Substituir áudio" : "Enviar áudio"}</>}
                  </Button>
                  {recordingId === a.id ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={stopRecording}
                    >
                      <Mic className="h-3.5 w-3.5 mr-1.5 animate-pulse" />
                      Parar ({recordSeconds}s)
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startRecording(a)}
                      disabled={!!recordingId || uploadingId === a.id}
                    >
                      <Mic className="h-3.5 w-3.5 mr-1.5" />
                      Gravar agora
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
                        {uploadingId === a.id
                          ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Salvando…</>
                          : <>Usar esta gravação</>}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => discardPreview(a.id)}>
                        Regravar
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}