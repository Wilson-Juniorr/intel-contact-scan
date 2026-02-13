import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const stageLabels: Record<string, string> = {
  novo: "Novo Negócio", tentativa_contato: "Tentativa de Contato",
  contato_realizado: "Contato Realizado", cotacao_enviada: "Cotação Enviada",
  cotacao_aprovada: "Cotação Aprovada", documentacao_completa: "Documentação Completa",
  em_emissao: "Em Emissão", aguardando_implantacao: "Aguardando Implantação",
  implantado: "Implantado", retrabalho: "Retrabalho",
  declinado: "Declinado", cancelado: "Cancelado",
};

interface LeadContext {
  name: string;
  firstName: string;
  stage: string;
  stageLabel: string;
  type: string;
  operator: string | null;
  lives: number | null;
  idleDays: number;
  idleHours: number;
  quoteMinValue: number | null;
  approvedValue: number | null;
  lastQuoteSentAt: string | null;
  notes: string | null;
  memorySummary: string | null;
  structuredData: Record<string, any>;
  recentMessages: string;
  recentInteractions: string;
  followUpsSent: number;
}

function buildContextSummary(ctx: LeadContext): string {
  const lines: string[] = [];
  lines.push(`LEAD: ${ctx.name} | Etapa: ${ctx.stageLabel} | Tipo: ${ctx.type === "PF" ? "Pessoa Física" : ctx.type === "PME" ? "PME" : "Adesão"}`);
  lines.push(`Operadora: ${ctx.operator || "não definida"} | Vidas: ${ctx.lives || "?"} | Parado: ${ctx.idleDays}d (${ctx.idleHours}h)`);
  
  if (ctx.quoteMinValue) lines.push(`Cotação enviada: R$${ctx.quoteMinValue}${ctx.lastQuoteSentAt ? ` em ${new Date(ctx.lastQuoteSentAt).toLocaleDateString("pt-BR")}` : ""}`);
  if (ctx.approvedValue) lines.push(`Valor aprovado: R$${ctx.approvedValue}`);
  if (ctx.followUpsSent > 0) lines.push(`Follow-ups já enviados: ${ctx.followUpsSent}`);
  if (ctx.notes) lines.push(`Notas: ${ctx.notes}`);
  
  if (ctx.memorySummary) lines.push(`\nMEMÓRIA:\n${ctx.memorySummary}`);
  
  const sd = ctx.structuredData;
  if (sd && Object.keys(sd).length > 0) {
    const parts: string[] = [];
    if (sd.orcamento) parts.push(`Orçamento: ${sd.orcamento}`);
    if (sd.rede_hospitais?.length) parts.push(`Rede: ${sd.rede_hospitais.join(", ")}`);
    if (sd.objecoes?.length) parts.push(`Objeções: ${sd.objecoes.join(", ")}`);
    if (sd.sentimento) parts.push(`Sentimento: ${sd.sentimento}`);
    if (sd.operadoras_discutidas?.length) parts.push(`Operadoras discutidas: ${sd.operadoras_discutidas.join(", ")}`);
    if (parts.length) lines.push(`DADOS: ${parts.join(" | ")}`);
  }
  
  if (ctx.recentMessages) lines.push(`\nÚLTIMAS MENSAGENS:\n${ctx.recentMessages}`);
  if (ctx.recentInteractions) lines.push(`\nINTERAÇÕES:\n${ctx.recentInteractions}`);
  
  return lines.join("\n");
}

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

    // Parallel data loading
    const leadPromise = supabase.from("leads").select("*").eq("id", leadId).eq("user_id", userId).single();
    const interactionsPromise = supabase.from("interactions").select("*").eq("lead_id", leadId).eq("user_id", userId).order("created_at", { ascending: false }).limit(15);
    const memoryPromise = supabase.from("lead_memory").select("summary, structured_json").eq("lead_id", leadId).eq("user_id", userId).maybeSingle();

    const [leadRes, interactionsRes, memoryRes] = await Promise.all([leadPromise, interactionsPromise, memoryPromise]);

    if (leadRes.error || !leadRes.data) {
      return new Response(JSON.stringify({ error: "Lead não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const lead = leadRes.data;

    // Load WhatsApp messages
    const normalizedPhone = lead.phone.replace(/\D/g, "");
    const phoneVariant = normalizedPhone.startsWith("55") ? normalizedPhone : `55${normalizedPhone}`;
    const { data: whatsappMsgs } = await supabase
      .from("whatsapp_messages")
      .select("direction, message_type, content, extracted_text, created_at")
      .or(`phone.eq.${phoneVariant},phone.eq.${normalizedPhone}`)
      .order("created_at", { ascending: false })
      .limit(20);

    // Calculate idle
    const lastActivity = lead.last_contact_at || lead.updated_at || lead.created_at;
    const diffMs = Date.now() - new Date(lastActivity).getTime();
    const idleHours = Math.floor(diffMs / (1000 * 60 * 60));
    const idleDays = Math.floor(idleHours / 24);

    // Count follow-ups sent
    const followUpsSent = (interactionsRes.data || []).filter((i: any) => i.description?.includes("[Follow-up")).length;

    const recentMessages = (whatsappMsgs || []).reverse()
      .map((m: any) => {
        const dir = m.direction === "outbound" ? "EU" : "CLIENTE";
        const text = m.extracted_text || m.content || "[mídia]";
        return `${dir}: ${text.slice(0, 200)}`;
      }).join("\n");

    const recentInteractions = (interactionsRes.data || [])
      .map((i: any) => `[${i.type}] ${i.description} (${new Date(i.created_at).toLocaleDateString("pt-BR")})`)
      .join("\n");

    const ctx: LeadContext = {
      name: lead.name,
      firstName: lead.name.split(" ")[0],
      stage: lead.stage,
      stageLabel: stageLabels[lead.stage] || lead.stage,
      type: lead.type,
      operator: lead.operator,
      lives: lead.lives,
      idleDays,
      idleHours,
      quoteMinValue: lead.quote_min_value,
      approvedValue: lead.approved_value,
      lastQuoteSentAt: lead.last_quote_sent_at,
      notes: lead.notes,
      memorySummary: memoryRes.data?.summary || null,
      structuredData: (memoryRes.data?.structured_json as Record<string, any>) || {},
      recentMessages,
      recentInteractions,
      followUpsSent,
    };

    const contextSummary = buildContextSummary(ctx);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um ESTRATEGISTA DE VENDAS e ESPECIALISTA em comunicação comercial via WhatsApp para planos de saúde. Você analisa o contexto completo do lead e define a melhor estratégia antes de gerar mensagens.

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne EXATAMENTE um JSON com esta estrutura:
{
  "analysis": "Análise breve do estado atual do lead (2-3 frases)",
  "strategy": "nome_da_estrategia",
  "strategy_reason": "Explicação de 1 frase do porquê dessa estratégia",
  "messages": ["msg1", "msg2", "msg3"]
}

ESTRATÉGIAS DISPONÍVEIS (escolha a mais adequada):
- "destravar_resposta": Lead não responde. Foco em gerar qualquer interação.
- "tratar_objecao": Lead tem objeção identificada (preço, rede, carência). Contornar com empatia.
- "reforcar_valor": Lead demonstrou interesse mas esfriou. Reforçar benefícios.
- "fechar_proxima_etapa": Lead quente, pronto para avançar. Guiar para próximo passo.
- "recuperar_lead_frio": Lead parado há muito tempo (5d+). Abordagem de resgate.
- "acompanhar_processo": Lead em fase operacional (emissão, documentação). Atualizar status.
- "primeira_abordagem": Lead novo, primeiro contato. Descobrir necessidade.

CRITÉRIOS PARA ESCOLHA:
- Se não responde há 3+ dias → destravar_resposta ou recuperar_lead_frio
- Se tem objeções registradas na memória → tratar_objecao
- Se cotação enviada e sem retorno → reforcar_valor
- Se demonstrou interesse recente → fechar_proxima_etapa  
- Se está em documentação/emissão → acompanhar_processo
- Se é lead novo → primeira_abordagem

REGRAS DE MENSAGEM:
- 2 a 4 mensagens curtas (até 2 linhas cada, ~120 chars)
- Tom HUMANO e natural — como vendedor real no WhatsApp
- Use o PRIMEIRO NOME do lead
- Emojis moderados (0-1 por msg, nunca no início)
- NUNCA "Olá" ou "Bom dia" genérico
- Se tiver dados reais (operadora, valores, rede), USE para personalizar
- Adapte urgência: >=5d mais direto, 1-2d mais casual
- O OBJETIVO é gerar RESPOSTA do cliente
- Se já enviou follow-ups, MUDE a abordagem (não repita)

ESTRUTURA DA SEQUÊNCIA:
1ª: Gancho / referência pessoal
2ª: Valor / informação relevante
3ª: CTA suave (pergunta)
4ª (opcional): Complemento / urgência sutil

NÃO retorne nada além do JSON.`,
          },
          {
            role: "user",
            content: `Analise o contexto e gere o follow-up estratégico:\n\n${contextSummary}${userContext ? `\n\nCONTEXTO DO VENDEDOR:\n${userContext}` : ""}\n\nResponda APENAS com o JSON.`,
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

    // Parse response
    let analysis = "";
    let strategy = "";
    let strategyReason = "";
    let messagesArray: string[] = [];

    try {
      const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      analysis = parsed.analysis || "";
      strategy = parsed.strategy || "destravar_resposta";
      strategyReason = parsed.strategy_reason || "";
      messagesArray = Array.isArray(parsed.messages) ? parsed.messages : [rawContent];
    } catch {
      messagesArray = rawContent.split("\n").filter((l: string) => l.trim().length > 0).slice(0, 4);
      if (messagesArray.length === 0) messagesArray = [rawContent];
      strategy = "destravar_resposta";
      analysis = "Não foi possível analisar o contexto detalhadamente.";
    }

    // Ensure 2-4 messages
    messagesArray = messagesArray.slice(0, 4);
    if (messagesArray.length < 2 && messagesArray[0]?.length > 200) {
      const words = messagesArray[0].split(" ");
      const mid = Math.ceil(words.length / 2);
      messagesArray = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
    }

    return new Response(JSON.stringify({ analysis, strategy, strategy_reason: strategyReason, messages: messagesArray }), {
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
