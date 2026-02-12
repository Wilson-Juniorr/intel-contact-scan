import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ConversationSummary {
  phone: string;
  leadId: string | null;
  leadName: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
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
    <Card className={`flex flex-col ${selectedPhone ? "hidden lg:flex" : "flex"}`}>
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversa..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {searchTerm ? "Nenhuma conversa encontrada" : "Nenhuma mensagem enviada ainda"}
          </div>
        ) : (
          <div className="divide-y divide-border">
            <AnimatePresence initial={false}>
              {conversations.map((conv, i) => (
                <motion.button
                  key={conv.phone}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                  onClick={() => onSelectPhone(conv.phone)}
                  className={`w-full text-left p-3 transition-colors ${
                    selectedPhone === conv.phone
                      ? "bg-accent"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <motion.div
                      className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center shrink-0"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <User className="h-5 w-5 text-success" />
                    </motion.div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm truncate">
                          {conv.leadName || formatPhone(conv.phone)}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {formatDistanceToNow(new Date(conv.lastMessageAt), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                      {conv.leadName && (
                        <p className="text-[11px] text-muted-foreground">{formatPhone(conv.phone)}</p>
                      )}
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {conv.lastMessage || "Mídia"}
                        </p>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                            {conv.messageCount}
                          </Badge>
                          {conv.unreadCount > 0 && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 500, damping: 15 }}
                            >
                              <Badge className="text-[9px] px-1.5 py-0 bg-success text-success-foreground">
                                {conv.unreadCount}
                              </Badge>
                            </motion.div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
