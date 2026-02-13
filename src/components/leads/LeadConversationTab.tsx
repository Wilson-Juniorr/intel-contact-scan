import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useContactAttempts } from "@/hooks/useContactAttempts";
import ChatBubble from "@/components/whatsapp/ChatBubble";
import { format } from "date-fns";
import { Loader2, MessageCircle, PhoneCall, Clock, TrendingUp, ChevronUp, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Props {
  leadPhone: string;
  leadName: string;
  compact?: boolean;
  leadId?: string | null;
}

const PAGE_SIZE = 50;

export function LeadConversationTab({ leadPhone, leadName, compact = false, leadId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const cleanPhone = leadPhone.replace(/\D/g, "");
  const normalizedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [allMessages, setAllMessages] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);

  const { totalAttempts, responseRate, avgResponseTimeMin, isLoading: attemptsLoading } =
    useContactAttempts(leadPhone);

  // Initial load: last PAGE_SIZE messages
  const messagesQuery = useQuery({
    queryKey: ["lead_conversation", normalizedPhone, 0],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("whatsapp_messages")
        .select("*", { count: "exact" })
        .eq("phone", normalizedPhone)
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE - 1);
      if (error) throw error;
      const msgs = (data || []).reverse();
      setAllMessages(msgs);
      setHasMore((count || 0) > PAGE_SIZE);
      return msgs;
    },
    enabled: !!user && !!cleanPhone,
  });

  // Scroll to bottom on initial load
  useEffect(() => {
    if (messagesQuery.data?.length) {
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 150);
    }
  }, [messagesQuery.data]);

  // Realtime subscription
  useEffect(() => {
    if (!user || !normalizedPhone) return;

    const channel = supabase
      .channel(`lead-conv-${normalizedPhone}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `phone=eq.${normalizedPhone}`,
        },
        (payload) => {
          setAllMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "whatsapp_messages",
          filter: `phone=eq.${normalizedPhone}`,
        },
        (payload) => {
          setAllMessages((prev) =>
            prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, normalizedPhone]);

  // Load older messages
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const from = nextPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("phone", normalizedPhone)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!error && data) {
      const older = data.reverse();
      setAllMessages((prev) => [...older, ...prev]);
      setHasMore(data.length === PAGE_SIZE);
      setPage(nextPage);
    }
    setLoadingMore(false);
  }, [loadingMore, hasMore, page, normalizedPhone]);

  if (messagesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const messages = allMessages;

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-3"} gap-2`}>
        <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card">
          <PhoneCall className="h-4 w-4 text-primary shrink-0" />
          <div>
            <p className="text-[10px] text-muted-foreground">Tentativas</p>
            <p className="text-sm font-bold">{attemptsLoading ? "..." : totalAttempts}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card">
          <TrendingUp className="h-4 w-4 text-secondary shrink-0" />
          <div>
            <p className="text-[10px] text-muted-foreground">Taxa Resposta</p>
            <p className="text-sm font-bold">{attemptsLoading ? "..." : `${responseRate}%`}</p>
          </div>
        </div>
        {!compact && (
          <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[10px] text-muted-foreground">Tempo Resposta</p>
              <p className="text-sm font-bold">
                {attemptsLoading
                  ? "..."
                  : avgResponseTimeMin !== null
                  ? avgResponseTimeMin < 60
                    ? `${avgResponseTimeMin}min`
                    : `${Math.round(avgResponseTimeMin / 60)}h`
                  : "—"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <MessageCircle className="h-10 w-10 mb-2 opacity-30" />
          <p className="text-xs">Nenhuma conversa encontrada</p>
          <p className="text-[10px] opacity-60">Sincronize o WhatsApp para ver o histórico</p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="overflow-y-auto rounded-lg max-h-[calc(100vh-320px)]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23182229' fill-opacity='0.6'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundColor: "#0b141a",
          }}
        >
          <div className="px-3 py-2 space-y-1">
            {/* Load more button */}
            {hasMore && (
              <div className="flex justify-center py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-xs text-muted-foreground gap-1.5 h-7"
                >
                  {loadingMore ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ChevronUp className="h-3 w-3" />
                  )}
                  Carregar anteriores
                </Button>
              </div>
            )}

            {messages.map((msg, i) => {
              const showDate =
                i === 0 ||
                format(new Date(msg.created_at), "dd/MM/yyyy") !==
                  format(new Date(messages[i - 1].created_at), "dd/MM/yyyy");
              return (
                <div key={msg.id}>
                  <ChatBubble msg={msg} showDate={showDate} index={i} />
                  {/* Show extracted text (transcription/OCR) */}
                  {msg.extracted_text && (
                    <div
                      className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"} mt-0.5`}
                    >
                      <div className="max-w-[80%] px-2.5 py-1.5 rounded-md bg-muted/40 border border-border/50">
                        <div className="flex items-center gap-1 mb-0.5">
                          <FileText className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[9px] text-muted-foreground font-medium uppercase">
                            {msg.message_type === "audio" || msg.message_type === "ptt"
                              ? "Transcrição"
                              : "Texto extraído"}
                          </span>
                        </div>
                        <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
                          {msg.extracted_text}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={scrollRef} />
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        {messages.length} mensagens • {messages.filter((m) => m.direction === "outbound").length} enviadas •{" "}
        {messages.filter((m) => m.direction === "inbound").length} recebidas
      </p>
    </div>
  );
}
