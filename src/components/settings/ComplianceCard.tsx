import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save } from "lucide-react";

export function ComplianceCard() {
  const { user } = useAuth();
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("21:00");
  const [weekdaysOnly, setWeekdaysOnly] = useState(false);
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("compliance_settings")
      .select("window_start, window_end, weekdays_only, ativo")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setStart(String(data.window_start).slice(0, 5));
        setEnd(String(data.window_end).slice(0, 5));
        setWeekdaysOnly(!!data.weekdays_only);
        setAtivo(!!data.ativo);
      });
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("compliance_settings").upsert({
      user_id: user.id,
      window_start: start,
      window_end: end,
      weekdays_only: weekdaysOnly,
      ativo,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Janela de envio salva");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Janela de envio automático</CardTitle>
        <CardDescription>
          Mensagens automáticas (IA, agendadas) só saem dentro deste horário (LGPD/ANS).
          Fora dele, ficam enfileiradas e enviam no próximo horário válido.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="compliance-active">Ativar restrição de horário</Label>
          <Switch id="compliance-active" checked={ativo} onCheckedChange={setAtivo} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Início</Label>
            <Input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              disabled={!ativo}
            />
          </div>
          <div className="space-y-2">
            <Label>Fim</Label>
            <Input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              disabled={!ativo}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="weekdays">Só dias úteis (seg-sex)</Label>
          <Switch
            id="weekdays"
            checked={weekdaysOnly}
            onCheckedChange={setWeekdaysOnly}
            disabled={!ativo}
          />
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </CardContent>
    </Card>
  );
}