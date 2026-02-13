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

    const { leadId, userContext } = await req.json();
    if (!leadId) throw new Error("leadId é obrigatório");

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("user_id", userId)
      .single();
    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: "Lead não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load interactions
    const { data: interactions } = await supabase
      .from("interactions")
      .select("*")
      .eq("lead_id", leadId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Load lead_memory
    const { data: memory } = await supabase
      .from("lead_memory")
      .select("summary, structured_json")
      .eq("lead_id", leadId)
      .eq("user_id", userId)
      .maybeSingle();

    // Load last WhatsApp messages
    const normalizedPhone = lead.phone.replace(/\D/g, "");
    const phoneVariant = normalizedPhone.startsWith("55") ? normalizedPhone : `55${normalizedPhone}`;
    const { data: whatsappMsgs } = await supabase
      .from("whatsapp_messages")
      .select("direction, message_type, content, extracted_text, created_at")
      .or(`phone.eq.${phoneVariant},phone.eq.${normalizedPhone}`)
      .order("created_at", { ascending: false })
      .limit(20);

    // Calculate idle time
    const lastActivity = lead.last_contact_at || lead.updated_at || lead.created_at;
    const diffMs = Date.now() - new Date(lastActivity).getTime();
    const idleHours = Math.floor(diffMs / (1000 * 60 * 60));
    const idleDays = Math.floor(idleHours / 24);

    const stageLabels: Record<string, string> = {
      novo: "Novo Negócio", tentativa_contato: "Tentativa de Contato",
      contato_realizado: "Contato Realizado", cotacao_enviada: "Cotação Enviada",
      cotacao_aprovada: "Cotação Aprovada", documentacao_completa: "Documentação Completa",
      em_emissao: "Em Emissão", aguardando_implantacao: "Aguardando Implantação",
      implantado: "Implantado", retrabalho: "Retrabalho",
      declinado: "Declinado", cancelado: "Cancelado",
    };

    const stageLabel = stageLabels[lead.stage] || lead.stage;

    const interactionsSummary = (interactions || [])
      .map((i: any) => `[${i.type}] ${i.description} (${new Date(i.created_at).toLocaleDateString("pt-BR")})`)
      .join("\n");

    const whatsappSummary = (whatsappMsgs || []).reverse()
      .map((m: any) => {
        const dir = m.direction === "outbound" ? "EU" : "CLIENTE";
        const text = m.extracted_text || m.content || "[mídia]";
        return `${dir}: ${text.slice(0, 200)}`;
      }).join("\n");

    // Build memory context
    let memoryContext = "";
    if (memory?.summary) {
      memoryContext = `\nMEMÓRIA DO LEAD (resumo atualizado):\n${memory.summary}`;
    }
    if (memory?.structured_json && Object.keys(memory.structured_json).length > 0) {
      const sj = memory.structured_json as any;
      const parts: string[] = [];
      if (sj.orcamento) parts.push(`Orçamento: ${sj.orcamento}`);
      if (sj.rede_hospitais?.length) parts.push(`Rede desejada: ${sj.rede_hospitais.join(", ")}`);
      if (sj.objecoes?.length) parts.push(`Objeções: ${sj.objecoes.join(", ")}`);
      if (sj.sentimento) parts.push(`Sentimento: ${sj.sentimento}`);
      if (sj.operadoras_discutidas?.length) parts.push(`Operadoras discutidas: ${sj.operadoras_discutidas.join(", ")}`);
      if (parts.length) memoryContext += `\nDADOS ESTRUTURADOS:\n${parts.join("\n")}`;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `Você é um ESPECIALISTA em comunicação comercial via WhatsApp, focado em vendas de planos de saúde. Você domina técnicas de copywriting, persuasão e gatilhos mentais adaptados ao WhatsApp.

FORMATO DE RESPOSTA:
- Retorne EXATAMENTE um JSON com a estrutura: {"messages": ["msg1", "msg2", "msg3"]}
- Gere de 2 a 4 mensagens curtas em SEQUÊNCIA
- Cada mensagem deve ter NO MÁXIMO 2 linhas (cerca de 120 caracteres)
- NÃO retorne nada além do JSON

ESTILO DE COMUNICAÇÃO:
- Tom HUMANO, como se fosse uma pessoa real digitando no WhatsApp
- Linguagem conversacional e natural (não robotizada)
- Use abreviações comuns quando natural (ex: "vc", "pra", "tá")
- Emojis moderados e estratégicos (0-1 por mensagem, NUNCA no início)
- NUNCA comece com "Olá" ou "Bom dia" genérico — seja criativo na abertura
- Cada mensagem deve ter uma função específica na sequência

ESTRUTURA DA SEQUÊNCIA:
1ª mensagem: Gancho de atenção / referência pessoal ao contexto do lead
2ª mensagem: Valor / benefício / informação relevante  
3ª mensagem: CTA suave (pergunta que convida resposta)
4ª mensagem (opcional): Complemento ou urgência sutil

REGRAS:
- Use o PRIMEIRO NOME do lead
- SE tiver dados reais do histórico (operadora, valores, rede, objeções), USE para personalizar
- Adapte urgência conforme tempo sem contato (>=5d mais direto, 1-2d mais casual)
- NUNCA prometa cobertura ou valores exatos sem confirmação
- O OBJETIVO é gerar uma RESPOSTA do cliente
- Pense como vendedor experiente que manda WhatsApp pra cliente real

CONTEXTO DA ETAPA:
- "Novo Negócio" / "Tentativa de Contato": Primeiro contato, descobrir necessidade
- "Contato Realizado": Reforçar interesse, tirar dúvida pendente
- "Cotação Enviada": Lembrar cotação + oferecer ajuste + CTA
- "Cotação Aprovada": Parabenizar e agilizar documentação
- "Documentação Completa" / "Em Emissão": Atualização de status
- "Retrabalho": Entender problema e oferecer solução`,
          },
          {
            role: "user",
            content: `Gere a SEQUÊNCIA de mensagens de follow-up para:
- Nome: ${lead.name}
- Etapa atual: ${stageLabel}
- Tipo: ${lead.type === "PF" ? "Pessoa Física" : lead.type === "PME" ? "PME" : "Adesão"}
- Operadora: ${lead.operator || "não definida"}
- Vidas: ${lead.lives || "não informado"}
- Tempo sem contato: ${idleDays} dias (${idleHours} horas)
- Notas: ${lead.notes || "nenhuma"}
${interactionsSummary ? `\nÚLTIMAS INTERAÇÕES:\n${interactionsSummary}` : ""}
${whatsappSummary ? `\nÚLTIMAS MENSAGENS WHATSAPP:\n${whatsappSummary}` : ""}${memoryContext}${userContext ? `\n\nCONTEXTO DO VENDEDOR:\n${userContext}` : ""}

Responda APENAS com o JSON {"messages": [...]}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("Erro ao gerar mensagem");
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "";

    // Parse the JSON response - handle markdown code blocks
    let messagesArray: string[] = [];
    try {
      const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      messagesArray = Array.isArray(parsed.messages) ? parsed.messages : [rawContent];
    } catch {
      // Fallback: split by newlines if JSON parsing fails
      messagesArray = rawContent.split("\n").filter((l: string) => l.trim().length > 0).slice(0, 4);
      if (messagesArray.length === 0) messagesArray = [rawContent];
    }

    // Ensure 2-4 messages
    messagesArray = messagesArray.slice(0, 4);
    if (messagesArray.length < 2 && messagesArray[0]?.length > 200) {
      // Split long single message
      const words = messagesArray[0].split(" ");
      const mid = Math.ceil(words.length / 2);
      messagesArray = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
    }

    return new Response(JSON.stringify({ messages: messagesArray }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("follow-up error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
