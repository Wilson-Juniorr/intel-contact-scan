import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useContactAttempts } from "@/hooks/useContactAttempts";
import ChatBubble from "@/components/whatsapp/ChatBubble";
import { format } from "date-fns";
import { Loader2, MessageCircle, PhoneCall, Clock, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  leadPhone: string;
  leadName: string;
  compact?: boolean;
}

export function LeadConversationTab({ leadPhone, leadName, compact = false }: Props) {
  const { user } = useAuth();
  const cleanPhone = leadPhone.replace(/\D/g, "");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { totalAttempts, responseRate, avgResponseTimeMin, isLoading: attemptsLoading } =
    useContactAttempts(leadPhone);

  const messagesQuery = useQuery({
    queryKey: ["lead_conversation", cleanPhone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("phone", cleanPhone)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!cleanPhone,
  });

  useEffect(() => {
    if (messagesQuery.data?.length) {
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 150);
    }
  }, [messagesQuery.data]);

  if (messagesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const messages = messagesQuery.data || [];

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
          className={`overflow-y-auto rounded-lg ${compact ? "max-h-[400px]" : "max-h-[500px]"}`}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23182229' fill-opacity='0.6'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            backgroundColor: "#0b141a",
          }}
        >
          <div className="px-3 py-2 space-y-1">
            {messages.map((msg, i) => {
              const showDate =
                i === 0 ||
                format(new Date(msg.created_at), "dd/MM/yyyy") !==
                  format(new Date(messages[i - 1].created_at), "dd/MM/yyyy");
              return <ChatBubble key={msg.id} msg={msg} showDate={showDate} index={i} />;
            })}
            <div ref={scrollRef} />
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        {messages.length} mensagens • {messages.filter((m) => m.direction === "outbound").length} enviadas • {messages.filter((m) => m.direction === "inbound").length} recebidas
      </p>
    </div>
  );
}
