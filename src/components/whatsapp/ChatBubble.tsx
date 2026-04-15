import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, CheckCheck, Mic, Image, FileText, Video, Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

interface WhatsAppMessage {
  id: string;
  phone: string;
  direction: string;
  message_type: string;
  content: string | null;
  status: string | null;
  lead_id: string | null;
  created_at: string;
  media_url?: string | null;
}

interface Props {
  msg: WhatsAppMessage;
  showDate: boolean;
  index: number;
}

export default function ChatBubble({ msg, showDate, index }: Props) {
  const isOutbound = msg.direction === "outbound";
  const isAudio = msg.message_type === "audio" || msg.message_type === "ptt";
  const isImage = msg.message_type === "image" || msg.message_type === "sticker";
  const isVideo = msg.message_type === "video";
  const isDocument = msg.message_type === "document";
  const hasMedia = isImage || isVideo || isDocument;
  const isTranscribed = isAudio && msg.content?.startsWith("🎤 ");
  const transcriptionText = isTranscribed ? msg.content!.slice(3) : null;

  const [mediaData, setMediaData] = useState<string | null>(null);
  const [mediaMime, setMediaMime] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  const loadMedia = async () => {
    if (mediaData || loadingMedia) return;
    setLoadingMedia(true);
    setMediaError(false);
    try {
      const { data, error } = await supabase.functions.invoke("download-media", {
        body: { message_id: msg.id },
      });
      if (error) throw error;
      if (data?.base64 && data?.mimeType) {
        setMediaData(`data:${data.mimeType};base64,${data.base64}`);
        setMediaMime(data.mimeType);
      } else {
        setMediaError(true);
      }
    } catch (e) {
      console.error("Media download error:", e);
      setMediaError(true);
    } finally {
      setLoadingMedia(false);
    }
  };

  const bubbleColor = isOutbound
    ? msg.status === "failed"
      ? "bg-red-900/60"
      : "bg-gradient-to-br from-[#005c4b] to-[#004a3d]"
    : "bg-[#202c33]";

  const renderMedia = () => {
    if (isImage) {
      if (mediaData) {
        return (
          <img
            src={mediaData}
            alt="Mídia"
            className="rounded-md max-w-full max-h-[300px] object-contain cursor-pointer mb-1 animate-fade-in"
            onClick={() => window.open(mediaData, "_blank")}
          />
        );
      }
      return (
        <button
          onClick={loadMedia}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 transition-colors mb-1 btn-press"
        >
          {loadingMedia ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#8696a0]" />
          ) : mediaError ? (
            <span className="text-[12px] text-[#8696a0]">⚠ Erro ao carregar</span>
          ) : (
            <>
              <Image className="h-4 w-4 text-[#8696a0]" />
              <span className="text-[12px] text-[#8696a0]">Carregar imagem</span>
            </>
          )}
        </button>
      );
    }

    if (isVideo) {
      if (mediaData) {
        return (
          <video controls className="rounded-md max-w-full max-h-[300px] mb-1 animate-fade-in">
            <source src={mediaData} type={mediaMime || "video/mp4"} />
          </video>
        );
      }
      return (
        <button
          onClick={loadMedia}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 transition-colors mb-1 btn-press"
        >
          {loadingMedia ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#8696a0]" />
          ) : (
            <>
              <Video className="h-4 w-4 text-[#8696a0]" />
              <span className="text-[12px] text-[#8696a0]">Carregar vídeo</span>
            </>
          )}
        </button>
      );
    }

    if (isDocument) {
      if (mediaData) {
        return (
          <a
            href={mediaData}
            download="documento"
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 transition-colors mb-1 btn-press"
          >
            <Download className="h-4 w-4 text-[#8696a0]" />
            <span className="text-[12px] text-[#8696a0]">Baixar documento</span>
          </a>
        );
      }
      return (
        <button
          onClick={loadMedia}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/10 hover:bg-white/15 transition-colors mb-1 btn-press"
        >
          {loadingMedia ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#8696a0]" />
          ) : (
            <>
              <FileText className="h-4 w-4 text-[#8696a0]" />
              <span className="text-[12px] text-[#8696a0]">Carregar documento</span>
            </>
          )}
        </button>
      );
    }

    return null;
  };

  return (
    <div>
      {showDate && (
        <div className="flex justify-center my-3">
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#182229] text-[#8696a0] text-[12px] px-3 py-1 rounded-lg shadow-sm"
          >
            {format(new Date(msg.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </motion.span>
        </div>
      )}
      <motion.div
        className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-0.5`}
        initial={{ opacity: 0, y: 6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <div
          className={`max-w-[65%] rounded-lg px-2.5 py-1.5 text-[14px] ${bubbleColor} text-[#e9edef] shadow-md relative`}
        >
          {/* Media content */}
          {hasMedia && renderMedia()}

          {/* Audio indicator */}
          {isAudio && (
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  isOutbound ? "bg-white/10" : "bg-white/5"
                } text-[#8696a0]`}
              >
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

          {/* Text content */}
          {(msg.content || (!hasMedia && !isAudio)) && (
            <p className="whitespace-pre-wrap break-words leading-[19px]">
              {isAudio ? transcriptionText || msg.content || "[Áudio]" : msg.content || "[Mídia]"}
            </p>
          )}

          <div className="flex items-center gap-1 justify-end mt-0.5 -mb-0.5">
            <span className="text-[11px] text-[#ffffff99]">
              {format(new Date(msg.created_at), "HH:mm")}
            </span>
            {isOutbound && msg.status === "sending" && (
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Clock className="h-3 w-3 text-[#ffffff80]" />
              </motion.span>
            )}
            {isOutbound && msg.status === "queued" && (
              <Clock className="h-3 w-3 text-[#ffffff60]" />
            )}
            {isOutbound && msg.status === "failed" && (
              <span className="text-[10px] text-red-400">✕</span>
            )}
            {isOutbound && msg.status === "sent" && (
              <CheckCheck className="h-[14px] w-[14px] text-[#ffffff99]" />
            )}
            {isOutbound && msg.status === "delivered" && (
              <CheckCheck className="h-[14px] w-[14px] text-[#ffffff99]" />
            )}
            {isOutbound && msg.status === "read" && (
              <CheckCheck className="h-[14px] w-[14px] text-[#53bdeb] drop-shadow-[0_0_3px_rgba(96,165,250,0.5)]" />
            )}
            {isOutbound &&
              !["sending", "queued", "failed", "sent", "delivered", "read"].includes(
                msg.status || ""
              ) &&
              msg.status !== "sending" &&
              msg.status !== "failed" && (
                <CheckCheck className="h-[14px] w-[14px] text-[#ffffff99]" />
              )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
