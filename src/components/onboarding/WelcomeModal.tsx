import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface WelcomeModalProps {
  open: boolean;
  onClose: () => void;
}

export function WelcomeModal({ open, onClose }: WelcomeModalProps) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Bem-vindo ao CRM Saúde! 🎉</DialogTitle>
          <DialogDescription className="text-base pt-2">
            Seu CRM inteligente para gestão de planos de saúde. Vamos configurar tudo em poucos passos:
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <div className="flex items-start gap-3 text-sm">
            <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs font-bold">1</span>
            <span>Sincronize seu WhatsApp para importar contatos automaticamente</span>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs font-bold">2</span>
            <span>Marque contatos pessoais para separar do CRM</span>
          </div>
          <div className="flex items-start gap-3 text-sm">
            <span className="bg-primary/10 text-primary rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-xs font-bold">3</span>
            <span>Crie seus leads e comece a vender com IA</span>
          </div>
        </div>
        <div className="flex gap-3">
          <Button className="flex-1 gap-2" onClick={() => { onClose(); navigate("/whatsapp"); }}>
            <MessageCircle className="h-4 w-4" /> Sincronizar WhatsApp
          </Button>
          <Button variant="ghost" onClick={onClose} className="gap-1">
            Fazer depois <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
