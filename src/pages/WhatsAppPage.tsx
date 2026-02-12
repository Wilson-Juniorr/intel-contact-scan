import { useState, useMemo, useEffect, useRef } from "react";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageCircle,
  Search,
  Send,
  Loader2,
  ArrowLeft,
  Clock,
  CheckCheck,
  User,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
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

interface ConversationSummary {
  phone: string;
  leadId: string | null;
  leadName: string | null;
  lastMessage: string | null;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
}

export default function WhatsAppPage() {
  const { leads } = useLeadsContext();
  const { user } = useAuth();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch all messages
  useEffect(() => {
    if (!user) return;
    const fetchMessages = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
      } else {
        setMessages(data || []);
      }
      setLoading(false);
    };
    fetchMessages();
  }, [user]);

  // Scroll to bottom when opening conversation
  useEffect(() => {
    if (selectedPhone) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [selectedPhone, messages]);

  // Build conversation summaries
  const conversations = useMemo(() => {
    const map = new Map<string, ConversationSummary>();

    messages.forEach((msg) => {
      const existing = map.get(msg.phone);
      const lead = leads.find((l) => {
        const cleanLeadPhone = l.phone.replace(/\D/g, "");
        const normalizedLeadPhone = cleanLeadPhone.startsWith("55")
          ? cleanLeadPhone
          : `55${cleanLeadPhone}`;
        return normalizedLeadPhone === msg.phone || cleanLeadPhone === msg.phone;
      });

      if (!existing) {
        map.set(msg.phone, {
          phone: msg.phone,
          leadId: msg.lead_id || lead?.id || null,
          leadName: lead?.name || null,
          lastMessage: msg.content,
          lastMessageAt: msg.created_at,
          messageCount: 1,
          unreadCount: msg.direction === "inbound" && msg.status !== "read" ? 1 : 0,
        });
      } else {
        existing.messageCount++;
        if (new Date(msg.created_at) > new Date(existing.lastMessageAt)) {
          existing.lastMessage = msg.content;
          existing.lastMessageAt = msg.created_at;
        }
        if (msg.direction === "inbound" && msg.status !== "read") {
          existing.unreadCount++;
        }
        if (!existing.leadName && lead?.name) {
          existing.leadName = lead.name;
          existing.leadId = lead.id;
        }
      }
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
  }, [messages, leads]);

  // Filter conversations
  const filteredConversations = useMemo(() => {
    if (!searchTerm.trim()) return conversations;
    const term = searchTerm.toLowerCase();
    return conversations.filter(
      (c) =>
        c.phone.includes(term) ||
        c.leadName?.toLowerCase().includes(term)
    );
  }, [conversations, searchTerm]);

  // Messages for selected conversation
  const conversationMessages = useMemo(() => {
    if (!selectedPhone) return [];
    return messages.filter((m) => m.phone === selectedPhone);
  }, [messages, selectedPhone]);

  const selectedConversation = conversations.find((c) => c.phone === selectedPhone);

  // Send message
  const handleSend = async () => {
    if (!newMessage.trim() || !selectedPhone) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          phone: selectedPhone,
          message: newMessage.trim(),
          lead_id: selectedConversation?.leadId || null,
        },
      });

      if (error) throw new Error(error.message);

      // Add to local messages
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          phone: selectedPhone,
          direction: "outbound",
          message_type: "text",
          content: newMessage.trim(),
          status: "sent",
          lead_id: selectedConversation?.leadId || null,
          created_at: new Date().toISOString(),
        },
      ]);
      setNewMessage("");
      toast({ title: "✅ Mensagem enviada!" });
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const formatPhone = (phone: string) => {
    if (phone.length === 13) {
      return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
    }
    return phone;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-[hsl(142,70%,40%)]" />
          WhatsApp
        </h1>
        <p className="text-muted-foreground text-sm">Histórico de mensagens com seus leads</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-200px)]">
        {/* Conversations list */}
        <Card className={`flex flex-col ${selectedPhone ? "hidden lg:flex" : "flex"}`}>
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {filteredConversations.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {conversations.length === 0
                  ? "Nenhuma mensagem enviada ainda"
                  : "Nenhuma conversa encontrada"}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredConversations.map((conv) => (
                  <button
                    key={conv.phone}
                    onClick={() => setSelectedPhone(conv.phone)}
                    className={`w-full text-left p-3 hover:bg-accent/50 transition-colors ${
                      selectedPhone === conv.phone ? "bg-accent" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-[hsl(142,70%,40%)]/10 flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-[hsl(142,70%,40%)]" />
                      </div>
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
                              <Badge className="text-[9px] px-1.5 py-0 bg-[hsl(142,70%,40%)]">
                                {conv.unreadCount}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Chat area */}
        <Card className={`flex flex-col ${!selectedPhone ? "hidden lg:flex" : "flex"}`}>
          {selectedPhone ? (
            <>
              {/* Chat header */}
              <div className="p-3 border-b border-border flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden h-8 w-8"
                  onClick={() => setSelectedPhone(null)}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="h-9 w-9 rounded-full bg-[hsl(142,70%,40%)]/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-[hsl(142,70%,40%)]" />
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {selectedConversation?.leadName || formatPhone(selectedPhone)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedConversation?.leadName
                      ? formatPhone(selectedPhone)
                      : `${conversationMessages.length} mensagens`}
                  </p>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {conversationMessages.map((msg, i) => {
                    const isOutbound = msg.direction === "outbound";
                    const showDate =
                      i === 0 ||
                      format(new Date(msg.created_at), "dd/MM/yyyy") !==
                        format(new Date(conversationMessages[i - 1].created_at), "dd/MM/yyyy");

                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-3">
                            <Badge variant="secondary" className="text-[10px] font-normal">
                              {format(new Date(msg.created_at), "dd 'de' MMMM 'de' yyyy", {
                                locale: ptBR,
                              })}
                            </Badge>
                          </div>
                        )}
                        <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                              isOutbound
                                ? "bg-[hsl(142,70%,40%)] text-white rounded-br-md"
                                : "bg-muted text-foreground rounded-bl-md"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{msg.content || "[Mídia]"}</p>
                            <div
                              className={`flex items-center gap-1 mt-1 ${
                                isOutbound ? "justify-end text-white/70" : "justify-end text-muted-foreground"
                              }`}
                            >
                              <span className="text-[10px]">
                                {format(new Date(msg.created_at), "HH:mm")}
                              </span>
                              {isOutbound && <CheckCheck className="h-3 w-3" />}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Message input */}
              <div className="p-3 border-t border-border">
                <div className="flex items-end gap-2">
                  <Textarea
                    placeholder="Digite uma mensagem..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    className="min-h-[40px] max-h-[120px] resize-none text-sm"
                    rows={1}
                  />
                  <Button
                    size="icon"
                    className="h-10 w-10 shrink-0 bg-[hsl(142,70%,40%)] hover:bg-[hsl(142,70%,35%)]"
                    onClick={handleSend}
                    disabled={!newMessage.trim() || sending}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-3">
                <MessageCircle className="h-16 w-16 mx-auto opacity-20" />
                <p className="text-sm">Selecione uma conversa para visualizar</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
