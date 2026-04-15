import { useState } from "react";
import { useOnboarding } from "@/hooks/useOnboarding";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Check, MessageCircle, UserCheck, UserPlus, Sparkles, X, ChevronUp, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const STEPS = [
  { key: "accountCreated" as const, label: "Criar conta", icon: Check, route: null },
  { key: "whatsappSynced" as const, label: "Sincronizar WhatsApp", icon: MessageCircle, route: "/whatsapp" },
  { key: "personalMarked" as const, label: "Marcar contatos pessoais", icon: UserCheck, route: "/whatsapp" },
  { key: "leadCreated" as const, label: "Criar primeiro lead", icon: UserPlus, route: "/leads" },
  { key: "aiUsed" as const, label: "Usar IA pela primeira vez", icon: Sparkles, route: "/assistant" },
];

export function OnboardingChecklist() {
  const { completed, checks, completedCount, loading, markCompleted } = useOnboarding();
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  if (loading || completed) return null;

  if (completedCount >= 5) {
    toast.success("🎉 Onboarding completo! Você está pronto para vender.", { duration: 5000 });
    markCompleted();
    return null;
  }

  const progress = (completedCount / 5) * 100;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 md:bottom-6 md:right-6">
      <Card className="shadow-lg border-primary/20">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Primeiros passos</CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCollapsed(!collapsed)}>
              {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={markCompleted}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        {!collapsed && (
          <CardContent className="space-y-3 pt-0">
            <div className="flex items-center gap-2">
              <Progress value={progress} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground font-medium">{completedCount}/5</span>
            </div>
            <div className="space-y-1.5">
              {STEPS.map(step => {
                const done = checks[step.key];
                return (
                  <button
                    key={step.key}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-md text-left text-sm transition-colors ${
                      done ? "text-muted-foreground" : "hover:bg-accent cursor-pointer"
                    }`}
                    disabled={done || !step.route}
                    onClick={() => step.route && navigate(step.route)}
                  >
                    <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${
                      done ? "bg-primary text-primary-foreground" : "border border-muted-foreground/30"
                    }`}>
                      {done && <Check className="h-3 w-3" />}
                    </div>
                    <span className={done ? "line-through" : ""}>{step.label}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
