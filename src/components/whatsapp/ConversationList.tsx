import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Search, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const AVATAR_GRADIENTS = [
  "from-blue-500 to-cyan-400",
  "from-purple-500 to-pink-400",
  "from-amber-500 to-orange-400",
  "from-emerald-500 to-teal-400",
  "from-rose-500 to-red-400",
  "from-indigo-500 to-violet-400",
];

interface ConversationSummary {
  phone: string;
  leadId: string | null;
  leadName: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
  isPersonal: boolean;
}

interface Props {
  conversations: ConversationSummary[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedPhone: string | null;
  onSelectPhone: (phone: string) => void;
  formatPhone: (phone: string) => string;
}

export default function ConversationList({
  conversations,
  searchTerm,
  onSearchChange,
  selectedPhone,
  onSelectPhone,
  formatPhone,
}: Props) {
  return (
    <div
      className={`flex flex-col bg-[#111b21] border-r border-[#2a3942] overflow-hidden ${selectedPhone ? "hidden lg:flex" : "flex"}`}
    >
      {/* WhatsApp-style header */}
      <div className="bg-[#202c33] px-4 py-3 flex items-center justify-between">
        <span className="text-[#e9edef] font-medium text-base">Conversas</span>
      </div>

      {/* Search bar */}
      <div className="px-2 py-1.5 bg-[#111b21]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8696a0]" />
          <Input
            placeholder="Pesquisar ou começar uma nova conversa"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm bg-[#202c33] border-0 text-[#e9edef] placeholder:text-[#8696a0] rounded-lg focus-visible:ring-1 focus-visible:ring-[#00a884]/50 focus-visible:ring-offset-0"
          />
        </div>
      </div>

      {/* Conversation list with native scroll */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {conversations.length === 0 ? (
          <div className="p-6 text-center text-sm text-[#8696a0]">
            {searchTerm ? "Nenhuma conversa encontrada" : "Nenhuma mensagem enviada ainda"}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {conversations.map((conv, i) => {
              const gradientIdx = (conv.leadName || conv.phone).charCodeAt(0) % AVATAR_GRADIENTS.length;
              const initials = conv.leadName
                ? conv.leadName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
                : null;

              return (
                <motion.button
                  key={conv.phone}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.5) }}
                  onClick={() => onSelectPhone(conv.phone)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 transition-all duration-200 ${
                    selectedPhone === conv.phone
                      ? "bg-[#2a3942] border-l-[3px] border-l-[#00a884]"
                      : "hover:bg-[#202c33] hover:translate-x-0.5 border-l-[3px] border-l-transparent"
                  }`}
                >
                  {/* Avatar */}
                  {initials ? (
                    <div className={`h-[49px] w-[49px] rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[gradientIdx]} flex items-center justify-center shrink-0 shadow-sm`}>
                      <span className="text-white font-semibold text-sm">{initials}</span>
                    </div>
                  ) : (
                    <div className="h-[49px] w-[49px] rounded-full bg-[#6b7b8d] flex items-center justify-center shrink-0">
                      <User className="h-6 w-6 text-[#cfd9df]" />
                    </div>
                  )}

                  {/* Content */}
                  <div className="min-w-0 flex-1 border-b border-[#2a3942] pb-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#e9edef] text-[15px] truncate">
                        {conv.leadName || formatPhone(conv.phone)}
                      </span>
                      {conv.isPersonal && (
                        <span className="text-[9px] bg-amber-500/20 text-amber-400 px-1 py-0.5 rounded font-medium shrink-0">
                          Pessoal
                        </span>
                      )}
                      <span className="text-[11px] text-[#8696a0] shrink-0">
                        {conv.messageCount > 0
                          ? formatDistanceToNow(new Date(conv.lastMessageAt), {
                              addSuffix: false,
                              locale: ptBR,
                            })
                          : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[13px] text-[#8696a0] truncate max-w-[200px]">
                        {conv.lastMessage ||
                          (conv.messageCount > 0 ? "Mídia" : formatPhone(conv.phone))}
                      </p>
                      {conv.unreadCount > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 500, damping: 15 }}
                          className="bg-[#00a884] text-[#111b21] text-[11px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 animate-pulse-glow"
                        >
                          {conv.unreadCount}
                        </motion.span>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
