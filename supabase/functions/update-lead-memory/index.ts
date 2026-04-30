import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
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

    // Load existing structured_json from lead_memory (if any) to preserve continuity
    const { data: existingMemory } = await supabase
      .from("lead_memory")
      .select("structured_json")
      .eq("lead_id", leadId)
      .eq("user_id", userId)
      .maybeSingle();
    const existingStructured = existingMemory?.structured_json || {};

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
          content: `Você é um assistente de CRM de planos de saúde. Com base no histórico de conversa e nos dados estruturados já coletados, gere:

1. Um RESUMO NARRATIVO (summary) de 3 a 8 linhas — uma nota interna para o corretor que vai atender este lead.
   Inclua: o que ele busca, para quem é (titular/dependentes), situação atual (tem plano ou não, qual operadora), urgência, região, hospital preferido se mencionado, e qualquer objeção ou hesitação identificada.
   Escreva em português, tom neutro, específico — nada genérico tipo "lead interessado em plano". Se faltar informação, diga o que ainda falta perguntar.

2. Um JSON ESTRUTURADO (structured_json) consolidando o que já foi coletado + o que aparece na conversa:
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

Mescle (não descarte) os dados estruturados existentes — só atualize/sobrescreva campos quando houver evidência nova na conversa.

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

DADOS ESTRUTURADOS JÁ COLETADOS (memória atual):
${JSON.stringify(existingStructured, null, 2)}

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
