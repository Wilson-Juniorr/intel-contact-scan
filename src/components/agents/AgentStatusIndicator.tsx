import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, Pause, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  leadId: string;
  inManualConversation?: boolean;
}

interface AgentState {
  nome: string;
  status: string;
}

export function AgentStatusIndicator({
  leadId,
  inManualConversation = false,
}: Props) {
  const [agent, setAgent] = useState<AgentState | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    let active = true;

    async function load() {
      const { data: conv } = await supabase
        .from("agent_conversations")
        .select("status, agent_slug")
        .eq("lead_id", leadId)
        .in("status", ["ativa", "digitando", "pausada"])
        .order("ultima_atividade", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active) return;

      if (!conv) {
        setAgent(null);
        return;
      }

      const { data: cfg } = await supabase
        .from("agents_config")
        .select("nome")
        .eq("slug", conv.agent_slug)
        .maybeSingle();

      if (!active) return;
      setAgent({
        nome: cfg?.nome ?? conv.agent_slug,
        status: conv.status,
      });
    }

    load();

    const channel = supabase
      .channel(`agent-conv-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_conversations",
          filter: `lead_id=eq.${leadId}`,
        },
        () => load(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  const toggleManual = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("leads")
        .update({ in_manual_conversation: !inManualConversation })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["whatsapp-leads"] });
      toast.success(
        inManualConversation
          ? "Devolvido para a Camila"
          : "Você assumiu a conversa",
      );
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // Don't render if no agent ever ran on this lead AND not in manual mode
  if (!agent && !inManualConversation) return null;

  const isTyping = agent?.status === "digitando";
  const isPaused = inManualConversation || agent?.status === "pausada";

  return (
    <div className="px-3 py-2 bg-[#1f2c33] border-b border-[#0b141a] flex items-center gap-2">
      <div
        className={`h-7 w-7 rounded-full flex items-center justify-center ${
          isPaused
            ? "bg-amber-500/20 text-amber-400"
            : "bg-emerald-500/20 text-emerald-400"
        }`}
      >
        {isPaused ? <Pause className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>

      <div className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          {isPaused ? (
            <motion.p
              key="paused"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-[12px] text-amber-300 truncate"
            >
              {agent?.nome ?? "Agente"} pausada — você está conduzindo
            </motion.p>
          ) : isTyping ? (
            <motion.div
              key="typing"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-1.5 text-[12px] text-emerald-300"
            >
              <span className="truncate">{agent?.nome} digitando</span>
              <span className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1 w-1 rounded-full bg-emerald-400"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </span>
            </motion.div>
          ) : (
            <motion.p
              key="active"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="text-[12px] text-emerald-300 truncate"
            >
              {agent?.nome} ativa
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-[11px] text-[#aebac1] hover:bg-[#2a3942] hover:text-[#e9edef]"
        disabled={toggleManual.isPending}
        onClick={() => toggleManual.mutate()}
      >
        <UserCog className="h-3.5 w-3.5 mr-1" />
        {inManualConversation ? "Devolver pra Camila" : "Assumir manualmente"}
      </Button>
    </div>
  );
}