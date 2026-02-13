import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Loader2, User, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import ChatBubble from "./ChatBubble";
import TemplateSelector from "./TemplateSelector";

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
  selectedPhone: string | null;
  selectedName: string | null;
  messages: WhatsAppMessage[];
  newMessage: string;
  sending: boolean;
  onNewMessageChange: (msg: string) => void;
  onSend: () => void;
  onBack: () => void;
  formatPhone: (phone: string) => string;
  leadStage?: string;
  leadOperator?: string;
  leadLives?: number;
}

export default function ChatArea({
  selectedPhone,
  selectedName,
  messages,
  newMessage,
  sending,
  onNewMessageChange,
  onSend,
  onBack,
  formatPhone,
  leadStage,
  leadOperator,
  leadLives,
}: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedPhone) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [selectedPhone, messages]);

  return (
    <div className={`flex flex-col overflow-hidden bg-[#0b141a] ${!selectedPhone ? "hidden lg:flex" : "flex"}`}>
      <AnimatePresence mode="wait">
        {selectedPhone ? (
          <motion.div
            key="chat"
            className="flex flex-col flex-1 min-h-0"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {/* Header */}
            <div className="bg-[#202c33] px-3 py-2 flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-8 w-8 text-[#aebac1] hover:bg-[#2a3942]"
                onClick={onBack}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="h-10 w-10 rounded-full bg-[#6b7b8d] flex items-center justify-center">
                <User className="h-5 w-5 text-[#cfd9df]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#e9edef] text-[15px] font-medium truncate">
                  {selectedName || formatPhone(selectedPhone)}
                </p>
                <p className="text-[12px] text-[#8696a0]">
                  {selectedName
                    ? formatPhone(selectedPhone)
                    : `${messages.length} mensagens`}
                </p>
              </div>
            </div>

            {/* Messages area with WhatsApp wallpaper pattern */}
            <div
              className="flex-1 min-h-0 overflow-y-auto px-[6%] py-2"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23182229' fill-opacity='0.6'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                backgroundColor: "#0b141a",
              }}
            >
              <div className="space-y-1 max-w-[920px] mx-auto">
                {messages.map((msg, i) => {
                  const showDate =
                    i === 0 ||
                    format(new Date(msg.created_at), "dd/MM/yyyy") !==
                      format(new Date(messages[i - 1].created_at), "dd/MM/yyyy");

                  return (
                    <ChatBubble key={msg.id} msg={msg} showDate={showDate} index={i} />
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input area */}
            <div className="bg-[#202c33] px-4 py-2.5 flex items-end gap-2">
              <TemplateSelector
                leadStage={leadStage}
                leadName={selectedName || undefined}
                leadOperator={leadOperator}
                leadLives={leadLives}
                onSelect={(text) => onNewMessageChange(text)}
              />
              <Textarea
                placeholder="Mensagem"
                value={newMessage}
                onChange={(e) => onNewMessageChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                className="min-h-[42px] max-h-[120px] resize-none text-[14px] bg-[#2a3942] border-0 text-[#e9edef] placeholder:text-[#8696a0] rounded-lg focus-visible:ring-0 focus-visible:ring-offset-0"
                rows={1}
              />
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.9 }}>
                <Button
                  size="icon"
                  className="h-[42px] w-[42px] shrink-0 rounded-full bg-[#00a884] hover:bg-[#06cf9c] border-0"
                  onClick={onSend}
                  disabled={!newMessage.trim() || sending}
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin text-[#111b21]" />
                  ) : (
                    <Send className="h-5 w-5 text-[#111b21]" />
                  )}
                </Button>
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            className="flex-1 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="text-center space-y-4">
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <MessageCircle className="h-20 w-20 mx-auto text-[#2a3942]" />
              </motion.div>
              <div>
                <p className="text-[#e9edef] text-xl font-light">WhatsApp Web</p>
                <p className="text-[#8696a0] text-sm mt-1">
                  Selecione uma conversa para começar
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
