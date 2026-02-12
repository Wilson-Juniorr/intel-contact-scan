import { motion } from "framer-motion";
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

  const bubbleColor = isOutbound
    ? msg.status === "failed"
      ? "bg-red-900/60"
      : "bg-[#005c4b]"
    : "bg-[#202c33]";

  return (
    <div>
      {showDate && (
        <div className="flex justify-center my-3">
          <span className="bg-[#182229] text-[#8696a0] text-[12px] px-3 py-1 rounded-lg shadow-sm">
            {format(new Date(msg.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </span>
        </div>
      )}
      <motion.div
        className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-0.5`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className={`max-w-[65%] rounded-lg px-2.5 py-1.5 text-[14px] ${bubbleColor} text-[#e9edef] shadow-sm relative`}>
          {/* Tail */}
          {isAudio && (
            <div className="flex items-center gap-2 mb-1">
              <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                isOutbound ? "bg-white/10" : "bg-white/5"
              } text-[#8696a0]`}>
                <Mic className="h-3 w-3" />
                <span>Áudio</span>
                {isTranscribed && <span className="opacity-70">• Transcrito</span>}
                {!isTranscribed && !msg.content && (
                  <motion.span
                    className="opacity-60"
                    animate={{ opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    • Transcrevendo...
                  </motion.span>
                )}
              </span>
            </div>
          )}

          <p className="whitespace-pre-wrap break-words leading-[19px]">
            {isAudio ? (transcriptionText || msg.content || "[Áudio]") : (msg.content || "[Mídia]")}
          </p>

          <div className="flex items-center gap-1 justify-end mt-0.5 -mb-0.5">
            <span className="text-[11px] text-[#ffffff99]">
              {format(new Date(msg.created_at), "HH:mm")}
            </span>
            {isOutbound && msg.status === "sending" && (
              <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.5, repeat: Infinity }}>
                <Clock className="h-3 w-3 text-[#ffffff80]" />
              </motion.span>
            )}
            {isOutbound && msg.status === "failed" && (
              <span className="text-[10px] text-red-400">✕</span>
            )}
            {isOutbound && msg.status !== "sending" && msg.status !== "failed" && (
              <CheckCheck className="h-[14px] w-[14px] text-[#53bdeb]" />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
