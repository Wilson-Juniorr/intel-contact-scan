import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ConversationList from "@/components/whatsapp/ConversationList";
import ChatArea from "@/components/whatsapp/ChatArea";

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

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
    } else {
      setMessages(data || []);
    }
  };

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    fetchMessages().finally(() => setLoading(false));

    const channel = supabase
      .channel("whatsapp-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          if (payload.eventType === "DELETE") return;
          const newMsg = payload.new as WhatsAppMessage;
          setMessages((prev) => {
            const filtered = prev.filter((m) => m.id !== newMsg.id);
            return [...filtered, newMsg].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
        }
      )
      .subscribe();

    const pollInterval = setInterval(fetchMessages, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [user]);

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

  const filteredConversations = useMemo(() => {
    if (!searchTerm.trim()) return conversations;
    const term = searchTerm.toLowerCase();
    return conversations.filter(
      (c) => c.phone.includes(term) || c.leadName?.toLowerCase().includes(term)
    );
  }, [conversations, searchTerm]);

  const conversationMessages = useMemo(() => {
    if (!selectedPhone) return [];
    return messages.filter((m) => m.phone === selectedPhone);
  }, [messages, selectedPhone]);

  const selectedConversation = conversations.find((c) => c.phone === selectedPhone);

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedPhone) return;
    const messageText = newMessage.trim();
    const tempId = crypto.randomUUID();

    const optimisticMsg: WhatsAppMessage = {
      id: tempId,
      phone: selectedPhone,
      direction: "outbound",
      message_type: "text",
      content: messageText,
      status: "sending",
      lead_id: selectedConversation?.leadId || null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setNewMessage("");
    setSending(true);

    try {
      const { error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          phone: selectedPhone,
          message: messageText,
          lead_id: selectedConversation?.leadId || null,
        },
      });

      if (error) throw new Error(error.message);

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "sent" } : m))
      );
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m))
      );
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
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <motion.span
            initial={{ rotate: -20, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 12 }}
          >
            <MessageCircle className="h-6 w-6 text-success" />
          </motion.span>
          WhatsApp
        </h1>
        <p className="text-muted-foreground text-sm">Histórico de mensagens com seus leads</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-200px)]">
        <ConversationList
          conversations={filteredConversations}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          selectedPhone={selectedPhone}
          onSelectPhone={setSelectedPhone}
          formatPhone={formatPhone}
        />

        <ChatArea
          selectedPhone={selectedPhone}
          selectedName={selectedConversation?.leadName || null}
          messages={conversationMessages}
          newMessage={newMessage}
          sending={sending}
          onNewMessageChange={setNewMessage}
          onSend={handleSend}
          onBack={() => setSelectedPhone(null)}
          formatPhone={formatPhone}
        />
      </div>
    </motion.div>
  );
}
