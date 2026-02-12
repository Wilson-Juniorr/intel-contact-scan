import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useLeadsContext } from "@/contexts/LeadsContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  contact_name: string | null;
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
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-whatsapp");
      if (error) throw new Error(error.message);
      toast({
        title: "Sincronização concluída",
        description: `${data.totalImported || 0} novas mensagens importadas, ${data.totalSkipped || 0} duplicadas ignoradas, ${data.contactsWithNames || 0}/${data.totalContacts || 0} contatos com nome, ${data.namesUpdated || 0} nomes atualizados`,
      });
      await fetchMessages();
    } catch (e: any) {
      toast({ title: "Erro na sincronização", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const fetchMessages = async () => {
    // Paginate to get ALL messages (Supabase default limit is 1000)
    const allMessages: WhatsAppMessage[] = [];
    let offset = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error("Error fetching messages:", error);
        break;
      }
      
      if (data && data.length > 0) {
        allMessages.push(...data);
      }
      
      if (!data || data.length < pageSize) break;
      offset += pageSize;
    }
    
    setMessages(allMessages);
  };

  useEffect(() => {
    if (!user) return;

    setLoading(true);
    fetchMessages().finally(() => setLoading(false));

    const channel = supabase
      .channel("whatsapp-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const newMsg = payload.new as WhatsAppMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          const updated = payload.new as WhatsAppMessage;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
          leadName: lead?.name || (msg as any).contact_name || null,
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
        if (!existing.leadName && (lead?.name || msg.contact_name)) {
          existing.leadName = lead?.name || msg.contact_name || null;
          existing.leadId = lead?.id || null;
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
      contact_name: null,
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
      <div className="flex items-center justify-between">
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Sincronizar conversas"}
        </Button>
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
