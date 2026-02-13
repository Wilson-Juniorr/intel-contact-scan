import { FollowUpPanel } from "@/components/followup/FollowUpPanel";
import { Clock } from "lucide-react";

export default function FollowUpPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Clock className="h-5 w-5" /> Follow-Up Inteligente
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Leads que precisam de atenção • Gere mensagens com IA e envie direto pelo WhatsApp
        </p>
      </div>
      <FollowUpPanel />
    </div>
  );
}
