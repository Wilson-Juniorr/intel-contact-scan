import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Each calendar day with at least 1 outbound message = 1 contact attempt

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

    // Group outbound messages by calendar day = 1 attempt per day
    const outboundDays = new Set<string>();
    const outboundByDay: Record<string, Date> = {};

    msgs.forEach((m) => {
      if (m.direction === "outbound") {
        const day = m.created_at.slice(0, 10); // YYYY-MM-DD
        outboundDays.add(day);
        const t = new Date(m.created_at);
        if (!outboundByDay[day] || t > outboundByDay[day]) {
          outboundByDay[day] = t;
        }
      }
    });

    if (outboundDays.size === 0) {
      return { totalAttempts: 0, lastAttemptAt: null, responseRate: 0, avgResponseTimeMin: null };
    }

    const sortedDays = Array.from(outboundDays).sort();
    const sessions = sortedDays.map((day) => ({
      day,
      lastMsg: outboundByDay[day],
    }));

    // Calculate response rate: for each attempt session, check if there's an inbound after
    let responded = 0;
    const responseTimes: number[] = [];

    for (const session of sessions) {
      const inboundAfter = msgs.find(
        (m) => m.direction === "inbound" && new Date(m.created_at) > session.lastMsg
      );
      if (inboundAfter) {
        responded++;
        const respTime = (new Date(inboundAfter.created_at).getTime() - session.lastMsg.getTime()) / 60000;
        responseTimes.push(respTime);
      }
    }

    const avgResponseTimeMin =
      responseTimes.length > 0
        ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
        : null;

    return {
      totalAttempts: sessions.length,
      lastAttemptAt: sessions[sessions.length - 1].lastMsg.toISOString(),
      responseRate: sessions.length > 0 ? Math.round((responded / sessions.length) * 100) : 0,
      avgResponseTimeMin,
    };
  }, [messagesQuery.data]);

  return {
    ...stats,
    isLoading: messagesQuery.isLoading,
  };
}
