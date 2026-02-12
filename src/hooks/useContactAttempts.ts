import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const GAP_MS = 3 * 60 * 60 * 1000; // 3 hours

export interface ContactAttemptStats {
  totalAttempts: number;
  lastAttemptAt: string | null;
  responseRate: number; // % of attempts that got a reply
  avgResponseTimeMin: number | null;
}

export function useContactAttempts(leadPhone: string | undefined) {
  const { user } = useAuth();
  const cleanPhone = leadPhone?.replace(/\D/g, "") || "";

  const messagesQuery = useQuery({
    queryKey: ["contact_attempts", cleanPhone],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("direction, created_at")
        .eq("phone", cleanPhone)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!cleanPhone,
  });

  const stats: ContactAttemptStats = useMemo(() => {
    const msgs = messagesQuery.data || [];
    if (msgs.length === 0) {
      return { totalAttempts: 0, lastAttemptAt: null, responseRate: 0, avgResponseTimeMin: null };
    }

    // Group outbound messages into "attempt sessions" with 3h gap
    const outboundTimes: Date[] = [];
    msgs.forEach((m) => {
      if (m.direction === "outbound") outboundTimes.push(new Date(m.created_at));
    });

    if (outboundTimes.length === 0) {
      return { totalAttempts: 0, lastAttemptAt: null, responseRate: 0, avgResponseTimeMin: null };
    }

    // Count sessions
    const sessions: { start: Date; end: Date }[] = [];
    let sessionStart = outboundTimes[0];
    let sessionEnd = outboundTimes[0];

    for (let i = 1; i < outboundTimes.length; i++) {
      const diff = outboundTimes[i].getTime() - sessionEnd.getTime();
      if (diff > GAP_MS) {
        sessions.push({ start: sessionStart, end: sessionEnd });
        sessionStart = outboundTimes[i];
      }
      sessionEnd = outboundTimes[i];
    }
    sessions.push({ start: sessionStart, end: sessionEnd });

    // Calculate response rate: for each attempt session, check if there's an inbound after
    let responded = 0;
    const responseTimes: number[] = [];

    for (const session of sessions) {
      const inboundAfter = msgs.find(
        (m) => m.direction === "inbound" && new Date(m.created_at) > session.end
      );
      if (inboundAfter) {
        responded++;
        const respTime = (new Date(inboundAfter.created_at).getTime() - session.end.getTime()) / 60000;
        responseTimes.push(respTime);
      }
    }

    const avgResponseTimeMin =
      responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null;

    return {
      totalAttempts: sessions.length,
      lastAttemptAt: sessions[sessions.length - 1].end.toISOString(),
      responseRate: sessions.length > 0 ? Math.round((responded / sessions.length) * 100) : 0,
      avgResponseTimeMin,
    };
  }, [messagesQuery.data]);

  return {
    ...stats,
    isLoading: messagesQuery.isLoading,
  };
}
