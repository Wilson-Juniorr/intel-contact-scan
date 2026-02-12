import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, MessageCircle, Send, Loader2, User } from "lucide-react";
import { format } from "date-fns";
import ChatBubble from "./ChatBubble";

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
  selectedPhone: string | null;
  selectedName: string | null;
  messages: WhatsAppMessage[];
  newMessage: string;
  sending: boolean;
  onNewMessageChange: (msg: string) => void;
  onSend: () => void;
  onBack: () => void;
  formatPhone: (phone: string) => string;
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
}: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedPhone) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [selectedPhone, messages]);

  return (
    <Card className={`flex flex-col ${!selectedPhone ? "hidden lg:flex" : "flex"}`}>
      <AnimatePresence mode="wait">
        {selectedPhone ? (
          <motion.div
            key="chat"
            className="flex flex-col flex-1 min-h-0"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* Header */}
            <div className="p-3 border-b border-border flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-8 w-8"
                onClick={onBack}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <motion.div
                className="h-9 w-9 rounded-full bg-success/10 flex items-center justify-center"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
              >
                <User className="h-4 w-4 text-success" />
              </motion.div>
              <div>
                <p className="font-semibold text-sm">
                  {selectedName || formatPhone(selectedPhone)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {selectedName
                    ? formatPhone(selectedPhone)
                    : `${messages.length} mensagens`}
                </p>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
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
            </ScrollArea>

            {/* Input */}
            <motion.div
              className="p-3 border-t border-border"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.2 }}
            >
              <div className="flex items-end gap-2">
                <Textarea
                  placeholder="Digite uma mensagem..."
                  value={newMessage}
                  onChange={(e) => onNewMessageChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onSend();
                    }
                  }}
                  className="min-h-[40px] max-h-[120px] resize-none text-sm"
                  rows={1}
                />
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.9 }}>
                  <Button
                    size="icon"
                    className="h-10 w-10 shrink-0 bg-success hover:bg-success/90"
                    onClick={onSend}
                    disabled={!newMessage.trim() || sending}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            className="flex-1 flex items-center justify-center text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="text-center space-y-3">
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <MessageCircle className="h-16 w-16 mx-auto opacity-20" />
              </motion.div>
              <p className="text-sm">Selecione uma conversa para visualizar</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
