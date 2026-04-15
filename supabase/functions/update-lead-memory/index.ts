import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordUsage } from "../_shared/usage-tracker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let leadId: string;
    let userId: string;
    let isServerCall = false;

    const body = await req.json();

    // Server-to-server call (from process-message-media)
    if (body.userId && body.leadId) {
      leadId = body.leadId;
      userId = body.userId;
      isServerCall = true;
    } else {
      // Client call with JWT
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseAuth = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: userData } = await supabaseAuth.auth.getUser();
      if (!userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = userData.user.id;
      leadId = body.leadId;
    }

    if (!leadId) throw new Error("leadId is required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify lead belongs to user
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, name, phone, stage, type, operator, plan_type, lives, notes, last_contact_at, created_at")
      .eq("id", leadId)
      .eq("user_id", userId)
      .single();

    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load last 50 messages (text + extracted_text)
    const normalizedPhone = lead.phone.replace(/\D/g, "");
    const phoneVariant = normalizedPhone.startsWith("55") ? normalizedPhone : `55${normalizedPhone}`;

    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("direction, message_type, content, extracted_text, created_at")
      .or(`phone.eq.${phoneVariant},phone.eq.${normalizedPhone}`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    // Load last interactions
    const { data: interactions } = await supabase
      .from("interactions")
      .select("type, description, created_at")
      .eq("lead_id", leadId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);

    // Load existing notes
    const { data: notes } = await supabase
      .from("lead_notes")
      .select("content, category, created_at")
      .eq("lead_id", leadId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Build context for AI
    const messagesSummary = (messages || []).reverse().map((m: any) => {
      const dir = m.direction === "outbound" ? "VENDEDOR" : "CLIENTE";
      const date = new Date(m.created_at).toLocaleDateString("pt-BR");
      const typeLabel = m.message_type !== "text" ? ` [${m.message_type}]` : "";
      const text = m.extracted_text || m.content || "[sem conteúdo]";
      return `[${date}] ${dir}${typeLabel}: ${text.slice(0, 300)}`;
    }).join("\n");

    const interactionsSummary = (interactions || []).map((i: any) => {
      return `[${new Date(i.created_at).toLocaleDateString("pt-BR")}] ${i.type}: ${i.description}`;
    }).join("\n");

    const notesSummary = (notes || []).map((n: any) => {
      return `[${n.category}] ${n.content.slice(0, 200)}`;
    }).join("\n");

    const stageLabels: Record<string, string> = {
      novo: "Novo", tentativa_contato: "Tentativa de Contato", contato_realizado: "Contato Realizado",
      cotacao_enviada: "Cotação Enviada", cotacao_aprovada: "Cotação Aprovada",
      documentacao_completa: "Doc. Completa", em_emissao: "Em Emissão",
      aguardando_implantacao: "Aguardando Implantação", implantado: "Implantado",
      retrabalho: "Retrabalho", declinado: "Declinado", cancelado: "Cancelado",
    };

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
        messages: [{
          role: "system",
          content: `Você é um analista de CRM de planos de saúde. Analise todo o contexto abaixo e gere:

1. Um RESUMO EXECUTIVO (summary) de 10-20 linhas com:
   - Perfil do cliente (tipo, vidas, região se mencionada)
   - Histórico de interações e negociação
   - Interesse/objeções/pedidos específicos do cliente
   - Propostas/operadoras discutidas com valores se disponíveis
   - Status atual e próximos passos recomendados

2. Um JSON ESTRUTURADO (structured_json) com:
{
  "modalidade": "PF|PJ|PME",
  "vidas": number|null,
  "orcamento": "faixa ou valor mencionado"|null,
  "rede_hospitais": ["hospitais/redes pedidos"],
  "urgencia": "baixa|media|alta|critica",
  "objecoes": ["objeções levantadas"],
  "interesses": ["o que o cliente busca"],
  "operadoras_discutidas": ["operadoras mencionadas"],
  "valores_cotados": ["valores/faixas cotados"],
  "proximos_passos": ["ações recomendadas"],
  "documentos_pendentes": ["documentos que faltam"],
  "ultima_interacao_dias": number,
  "sentimento": "positivo|neutro|negativo|frio"
}

Responda APENAS no formato:
---SUMMARY---
[resumo aqui]
---JSON---
{json aqui}`,
        }, {
          role: "user",
          content: `LEAD: ${lead.name}
Etapa: ${stageLabels[lead.stage] || lead.stage}
Tipo: ${lead.type}
Operadora: ${lead.operator || "não definida"}
Plano: ${lead.plan_type || "não definido"}
Vidas: ${lead.lives || "não informado"}
Notas gerais: ${lead.notes || "nenhuma"}
Criado em: ${new Date(lead.created_at).toLocaleDateString("pt-BR")}
Último contato: ${lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleDateString("pt-BR") : "nunca"}

${messagesSummary ? `MENSAGENS WHATSAPP (${(messages || []).length}):\n${messagesSummary}` : "Sem mensagens WhatsApp."}

${interactionsSummary ? `INTERAÇÕES CRM:\n${interactionsSummary}` : "Sem interações registradas."}

${notesSummary ? `NOTAS:\n${notesSummary}` : "Sem notas."}`,
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI processing failed");
    }

    const aiData = await response.json();
    // Track usage using service role client (already created as `supabase` above)
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await recordUsage(supabaseAdmin, userId, "update-lead-memory", aiData);
    const aiContent = aiData.choices?.[0]?.message?.content || "";

    // Parse response
    let summary = "";
    let structuredJson: any = {};

    const summaryMatch = aiContent.match(/---SUMMARY---\s*([\s\S]*?)(?:---JSON---|$)/);
    if (summaryMatch) summary = summaryMatch[1].trim();

    const jsonMatch = aiContent.match(/---JSON---\s*(\{[\s\S]*\})/);
    if (jsonMatch) {
      try {
        structuredJson = JSON.parse(jsonMatch[1].trim());
      } catch {
        console.error("Failed to parse structured JSON from AI");
      }
    }

    if (!summary && !jsonMatch) {
      // Fallback: use entire response as summary
      summary = aiContent.slice(0, 2000);
    }

    // Upsert lead_memory
    const { error: upsertErr } = await supabase
      .from("lead_memory")
      .upsert({
        lead_id: leadId,
        user_id: userId,
        summary,
        structured_json: structuredJson,
        updated_at: new Date().toISOString(),
      }, { onConflict: "lead_id,user_id" });

    if (upsertErr) {
      console.error("Upsert error:", upsertErr.message);
      throw new Error("Failed to save lead memory");
    }

    console.log(`Lead memory updated for ${leadId}: summary=${summary.length}chars`);

    return new Response(JSON.stringify({
      updated: true,
      summary: summary.slice(0, 300) + (summary.length > 300 ? "..." : ""),
      structuredJson,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Update lead memory error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
