import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { checkAndTrackUsage, recordUsage } from "../_shared/usage-tracker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
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

    const usageCheck = await checkAndTrackUsage(userId, "suggest-tasks");
    if (!usageCheck.allowed) {
      return new Response(JSON.stringify({ error: usageCheck.error, code: "AI_LIMIT_REACHED" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { leadId } = await req.json();
    if (!leadId) throw new Error("leadId é obrigatório");

    // Load lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("user_id", userId)
      .single();
    if (leadError || !lead) throw new Error("Lead não encontrado");

    // Load memory, existing tasks, and recent messages in parallel
    const phone = lead.phone.replace(/\D/g, "");
    const phoneKey = phone.startsWith("55") ? phone : `55${phone}`;

    const [memoryRes, tasksRes, msgsRes] = await Promise.all([
      supabase.from("lead_memory").select("summary, structured_json").eq("lead_id", leadId).eq("user_id", userId).maybeSingle(),
      supabase.from("tasks").select("title, status").eq("lead_id", leadId).eq("user_id", userId),
      supabase.from("whatsapp_messages")
        .select("direction, content, extracted_text, extracted_semantic_summary, message_type, created_at")
        .eq("phone", phoneKey)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const memory = memoryRes.data;
    const existingTasks = tasksRes.data || [];
    const messages = msgsRes.data || [];

    // Build conversation summary for AI
    const msgSummary = messages.reverse().map((m: any) => {
      const dir = m.direction === "outbound" ? "EU" : "CLIENTE";
      const text = m.content || m.extracted_text || m.extracted_semantic_summary || `[${m.message_type}]`;
      return `${dir}: ${text.slice(0, 200)}`;
    }).join("\n");

    const sj = (memory?.structured_json || {}) as any;

    let context = `Lead: ${lead.name} | Estágio: ${lead.stage} | Tipo: ${lead.type}`;
    if (lead.operator) context += ` | Operadora: ${lead.operator}`;
    if (lead.lives) context += ` | Vidas: ${lead.lives}`;
    if (sj.orcamento) context += ` | Orçamento: ${sj.orcamento}`;
    if (sj.objecoes?.length) context += ` | Objeções: ${sj.objecoes.join(", ")}`;
    if (memory?.summary) context += `\nResumo da memória: ${memory.summary.slice(0, 500)}`;
    
    const existingTasksList = existingTasks.map((t: any) => `- [${t.status}] ${t.title}`).join("\n");
    if (existingTasksList) context += `\n\nTarefas existentes:\n${existingTasksList}`;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Você é um gerente comercial de planos de saúde. Analise a conversa completa do WhatsApp (incluindo transcrições de áudio, textos extraídos de imagens e PDFs) e sugira de 3 a 5 tarefas CONCRETAS e ACIONÁVEIS para avançar este lead.

REGRAS:
- Cada tarefa deve ser baseada em algo ESPECÍFICO mencionado na conversa
- NÃO repita tarefas que já existem
- Priorize: documentos pendentes, informações faltantes, promessas feitas, objeções não resolvidas, próximos passos combinados
- Cada tarefa deve ter: title (curto, ação clara), reason (por que essa tarefa, baseado na conversa)
- Ordene por urgência

Responda APENAS em JSON válido, sem markdown:
{"tasks":[{"title":"...","reason":"..."}]}`,
          },
          {
            role: "user",
            content: `${context}\n\n--- CONVERSA WHATSAPP (últimas 30 msgs) ---\n${msgSummary || "Sem mensagens"}`,
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
    await recordUsage(usageCheck.supabaseAdmin, userId, "suggest-tasks", aiData);
    let content = aiData.choices?.[0]?.message?.content || "{}";
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      result = { tasks: [] };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-tasks error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
