import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCheck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface WhatsAppMessage {
  id: string;
  phone: string;
  direction: string;
  message_type: string;
  content: string | null;
  status: string | null;
  lead_id: string | null;
  created_at: string;
}

interface Props {
  msg: WhatsAppMessage;
  showDate: boolean;
  index: number;
}

export default function ChatBubble({ msg, showDate, index }: Props) {
  const isOutbound = msg.direction === "outbound";

  const bubbleClass = isOutbound
    ? msg.status === "failed"
      ? "bg-destructive text-destructive-foreground rounded-br-md"
      : msg.status === "sending"
        ? "bg-success/80 text-success-foreground rounded-br-md"
        : "bg-success text-success-foreground rounded-br-md"
    : "bg-muted text-foreground rounded-bl-md";

  return (
    <div>
      {showDate && (
        <motion.div
          className="flex justify-center my-3"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Badge variant="secondary" className="text-[10px] font-normal">
            {format(new Date(msg.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </Badge>
        </motion.div>
      )}
      <motion.div
        className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
        initial={{
          opacity: 0,
          y: 12,
          x: isOutbound ? 20 : -20,
          scale: 0.95,
        }}
        animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
        transition={{
          duration: 0.25,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
      >
        <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${bubbleClass}`}>
          <p className="whitespace-pre-wrap break-words">{msg.content || "[Mídia]"}</p>
          <div
            className={`flex items-center gap-1 mt-1 ${
              isOutbound ? "justify-end opacity-70" : "justify-end text-muted-foreground"
            }`}
          >
            <span className="text-[10px]">
              {format(new Date(msg.created_at), "HH:mm")}
            </span>
            {isOutbound && msg.status === "sending" && (
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Clock className="h-3 w-3" />
              </motion.span>
            )}
            {isOutbound && msg.status === "failed" && (
              <span className="text-[10px]">✕</span>
            )}
            {isOutbound && msg.status !== "sending" && msg.status !== "failed" && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 12, delay: 0.2 }}
              >
                <CheckCheck className="h-3 w-3" />
              </motion.span>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
