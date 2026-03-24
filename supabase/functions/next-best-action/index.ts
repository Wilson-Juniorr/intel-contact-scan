import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    const { leadId, leadIds } = await req.json();
    const ids = leadIds || (leadId ? [leadId] : []);
    if (!ids.length) throw new Error("leadId ou leadIds é obrigatório");

    // Limit batch size
    const batch = ids.slice(0, 20);

    // Load leads
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("*")
      .in("id", batch)
      .eq("user_id", userId);
    if (leadsError) throw leadsError;
    if (!leads?.length) {
      return new Response(JSON.stringify({ results: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load memories
    const { data: memories } = await supabase
      .from("lead_memory")
      .select("lead_id, summary, structured_json")
      .in("lead_id", batch)
      .eq("user_id", userId);
    const memoryMap = new Map((memories || []).map((m: any) => [m.lead_id, m]));

    // Load open tasks
    const { data: openTasks } = await supabase
      .from("tasks")
      .select("lead_id, title, due_at, status")
      .in("lead_id", batch)
      .eq("user_id", userId)
      .eq("status", "open");
    const tasksMap = new Map<string, any[]>();
    (openTasks || []).forEach((t: any) => {
      if (!tasksMap.has(t.lead_id)) tasksMap.set(t.lead_id, []);
      tasksMap.get(t.lead_id)!.push(t);
    });

    // Load recent messages for each lead phone
    const phones = leads.map((l: any) => {
      const p = l.phone.replace(/\D/g, "");
      return p.startsWith("55") ? p : `55${p}`;
    });
    const { data: recentMsgs } = await supabase
      .from("whatsapp_messages")
      .select("phone, direction, content, extracted_text, created_at")
      .in("phone", [...new Set(phones)])
      .order("created_at", { ascending: false })
      .limit(100);
    const msgsByPhone = new Map<string, any[]>();
    (recentMsgs || []).forEach((m: any) => {
      if (!msgsByPhone.has(m.phone)) msgsByPhone.set(m.phone, []);
      msgsByPhone.get(m.phone)!.push(m);
    });

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    // Build AI prompt for batch
    const leadsContext = leads.map((lead: any) => {
      const mem = memoryMap.get(lead.id);
      const tasks = tasksMap.get(lead.id) || [];
      const phone = lead.phone.replace(/\D/g, "");
      const phoneKey = phone.startsWith("55") ? phone : `55${phone}`;
      const msgs = (msgsByPhone.get(phoneKey) || []).slice(0, 5);

      const lastActivity = lead.last_contact_at || lead.updated_at;
      const idleDays = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));

      const sj = (mem?.structured_json || {}) as any;

      let context = `LEAD: ${lead.name} | Estágio: ${lead.stage} | Tipo: ${lead.type} | Dias sem contato: ${idleDays}`;
      if (lead.operator) context += ` | Operadora: ${lead.operator}`;
      if (lead.lives) context += ` | Vidas: ${lead.lives}`;
      if (sj.orcamento) context += ` | Orçamento: ${sj.orcamento}`;
      if (sj.objecoes?.length) context += ` | Objeções: ${sj.objecoes.join(", ")}`;
      if (sj.urgencia) context += ` | Urgência: ${sj.urgencia}`;
      if (sj.sentimento) context += ` | Sentimento: ${sj.sentimento}`;
      if (mem?.summary) context += `\nResumo: ${mem.summary.slice(0, 300)}`;
      if (tasks.length) context += `\nTarefas abertas: ${tasks.map((t: any) => t.title).join(", ")}`;
      if (msgs.length) {
        const lastMsg = msgs[0];
        const dir = lastMsg.direction === "outbound" ? "EU" : "CLIENTE";
        context += `\nÚltima msg: ${dir}: ${(lastMsg.content || lastMsg.extracted_text || "[mídia]").slice(0, 150)}`;
      }

      return { id: lead.id, context };
    });

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash-lite",
        messages: [
          {
            role: "system",
            content: `Você é um gerente comercial de planos de saúde. Para cada lead abaixo, sugira a PRÓXIMA MELHOR AÇÃO.

REGRAS:
- priority: "critico" (sem contato 5+ dias em estágio ativo), "urgente" (3-4 dias ou cotação pendente), "atencao" (1-2 dias), "ok" (contato recente)
- reason: 1 frase curta explicando porque esta ação é necessária
- suggested_action: ação concreta (ligar, enviar mensagem, pedir documento, etc.)
- suggested_message: se aplicável, uma mensagem curta personalizada usando dados reais do lead (orçamento, rede, objeções). Se não tiver dados, faça uma pergunta de qualificação. NUNCA genérica.
- suggested_task: se aplicável, título de tarefa curto

Responda APENAS em JSON válido, sem markdown. Formato:
[{"id":"lead_id","priority":"...","reason":"...","suggested_action":"...","suggested_message":"...","suggested_task":"..."}]`,
          },
          {
            role: "user",
            content: leadsContext.map((l) => `[${l.id}]\n${l.context}`).join("\n\n---\n\n"),
          },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error("AI error");
    }

    const aiData = await response.json();
    let content = aiData.choices?.[0]?.message?.content || "[]";
    // Strip markdown fences if present
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let results;
    try {
      results = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      results = [];
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("next-best-action error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
