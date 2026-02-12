import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCheck, Mic } from "lucide-react";
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
  const isAudio = msg.message_type === "audio" || msg.message_type === "ptt";
  const isTranscribed = isAudio && msg.content?.startsWith("🎤 ");
  const transcriptionText = isTranscribed ? msg.content!.slice(3) : null;

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
          {/* Audio indicator */}
          {isAudio && (
            <div className="flex items-center gap-2 mb-1">
              <motion.div
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  isOutbound
                    ? "bg-white/15 text-white/90"
                    : "bg-foreground/10 text-foreground/70"
                }`}
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
              >
                <Mic className="h-3 w-3" />
                <span>Áudio</span>
                {isTranscribed && (
                  <span className="opacity-70">• Transcrito</span>
                )}
                {!isTranscribed && !msg.content && (
                  <motion.span
                    className="opacity-60"
                    animate={{ opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    • Transcrevendo...
                  </motion.span>
                )}
              </motion.div>
            </div>
          )}

          {/* Message content */}
          {isAudio ? (
            <p className="whitespace-pre-wrap break-words">
              {transcriptionText || msg.content || "[Áudio]"}
            </p>
          ) : (
            <p className="whitespace-pre-wrap break-words">{msg.content || "[Mídia]"}</p>
          )}

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
