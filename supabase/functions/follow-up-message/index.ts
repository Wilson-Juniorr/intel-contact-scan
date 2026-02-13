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
  waitingReply: boolean;
  lastClientMessage: string | null;
  lastClientMessageDaysAgo: number | null;
}

function buildContextSummary(ctx: LeadContext): string {
  const lines: string[] = [];
  lines.push(`LEAD: ${ctx.name} | Etapa: ${ctx.stageLabel} | Tipo: ${ctx.type === "PF" ? "Pessoa Física" : ctx.type === "PME" ? "PME" : "Adesão"}`);
  lines.push(`Operadora: ${ctx.operator || "não definida"} | Vidas: ${ctx.lives || "?"} | Parado: ${ctx.idleDays}d (${ctx.idleHours}h)`);
  lines.push(`Aguardando resposta: ${ctx.waitingReply ? "SIM" : "NÃO"}`);
  
  if (ctx.lastClientMessage) {
    lines.push(`Última msg do cliente (${ctx.lastClientMessageDaysAgo}d atrás): "${ctx.lastClientMessage.slice(0, 200)}"`);
  }
  
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
    if (sd.prazos) parts.push(`Prazos: ${JSON.stringify(sd.prazos)}`);
    if (sd.concorrentes) parts.push(`Concorrentes: ${JSON.stringify(sd.concorrentes)}`);
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
    const [leadRes, interactionsRes, memoryRes] = await Promise.all([
      supabase.from("leads").select("*").eq("id", leadId).eq("user_id", userId).single(),
      supabase.from("interactions").select("*").eq("lead_id", leadId).eq("user_id", userId).order("created_at", { ascending: false }).limit(15),
      supabase.from("lead_memory").select("summary, structured_json").eq("lead_id", leadId).eq("user_id", userId).maybeSingle(),
    ]);

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

    // Determine waiting_reply and last client message
    const sortedMsgs = (whatsappMsgs || []).slice().sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const lastOutbound = sortedMsgs.find((m: any) => m.direction === "outbound");
    const lastInbound = sortedMsgs.find((m: any) => m.direction === "inbound");
    const waitingReply = lastOutbound && (!lastInbound || new Date(lastOutbound.created_at) > new Date(lastInbound.created_at));
    
    let lastClientMessage: string | null = null;
    let lastClientMessageDaysAgo: number | null = null;
    if (lastInbound) {
      lastClientMessage = lastInbound.extracted_text || lastInbound.content || null;
      lastClientMessageDaysAgo = Math.floor((Date.now() - new Date(lastInbound.created_at).getTime()) / (1000 * 60 * 60 * 24));
    }

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
      waitingReply: !!waitingReply,
      lastClientMessage,
      lastClientMessageDaysAgo,
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
            content: `Você é um TOP CLOSER — estrategista de vendas de planos de saúde via WhatsApp. Você combina leitura comportamental, controle de pressão e copy persuasiva para gerar resposta do cliente.

FORMATO DE RESPOSTA OBRIGATÓRIO — retorne EXATAMENTE um JSON:
{
  "analysis": "Análise breve do estado atual (2-3 frases)",
  "strategy": "nome_da_estrategia",
  "goal": "Objetivo específico desta sequência (1 frase)",
  "silence_stage": "early|mid|late",
  "pressure_level": "soft|medium|direct",
  "flow_pattern": "super_short|default|validate_tension_direct",
  "behavior": {
    "decision_style": "analytical|practical|emotional|skeptical"|null,
    "likely_objection": "price|trust|indecision|comparison"|null,
    "energy_level": "high|medium|low"|null,
    "confidence": "low|medium|high"
  },
  "guardrails": {
    "must_confirm_network": boolean,
    "avoid_discount_promises": boolean,
    "competitor_mode": boolean
  },
  "urgency_flag": boolean,
  "messages": ["msg1", "msg2", ...],
  "risk_flags": ["flag1", ...]
}

═══ A) BEHAVIORAL LAYER ═══
Infira com base nas mensagens do cliente:
- decision_style: analytical (pede dados/comparativos), practical (quer solução rápida), emotional (fala de família/medo), skeptical (desconfia/questiona). null se sem evidência.
- likely_objection: price (reclamou valor), trust (desconfia), indecision (vai pensar), comparison (comparou concorrente). null se sem evidência.
- energy_level: high (respostas rápidas/longas), medium (respostas curtas), low (monossilábico/sumiu). null se sem mensagens.
- confidence: quão confiante você está nessas inferências.
REGRA: Trate como HIPÓTESE, adapte a copy mas nunca afirme certezas sobre o cliente.

═══ B) SILENCE & PRESSURE ═══
Calcule:
- silence_stage: early (0-2d sem resposta), mid (3-5d), late (6d+)
- pressure_level: soft (early ou lead novo), medium (mid), direct (late + já enviou follow-ups)
Ajuste pela situação: se waiting_reply=false, pode ser mais soft mesmo em mid.

═══ C) FLOW PATTERN ═══
Escolha automática:
- super_short (2 msgs): silence_stage=late OU pressure=soft com lead frio
- default (2-3 msgs): cenário padrão
- validate_tension_direct (3 msgs): mid/late + medium/direct, padrão: validar → tensão leve → CTA direto

═══ D) GUARDRAILS ═══
- must_confirm_network: true se cliente citou hospital/rede específica nas mensagens ou memória. A mensagem deve PERGUNTAR/CONFIRMAR, NUNCA PROMETER cobertura.
- avoid_discount_promises: true se objeção é preço. NUNCA prometa desconto. Ofereça alternativas (plano diferente, coparticipação, ajuste de rede).
- competitor_mode: true se citou outro corretor/seguradora. Use abordagem consultiva comparativa, sem falar mal.
Se ativado, a copy DEVE respeitar o guardrail. Violar guardrail é erro grave.

═══ E) URGENCY ═══
urgency_flag=true APENAS se existir dado real:
- prazo de cotação expirando (last_quote_sent_at > 7d)
- prazo de reajuste mencionado na memória
- prazo de implantação/carência  
Se NÃO existir dado real → urgency_flag=false. Tom sempre leve, nunca inventar urgência.

═══ F) RISK FLAGS ═══
Retorne alertas se:
- Lead pode estar irritado com excesso de follow-up
- Informação contraditória detectada
- Guardrail pode ser difícil de respeitar
- Dados insuficientes para inferência confiável

═══ G) COPY RULES ═══
- Quantidade: obedeça flow_pattern (2 a 3 msgs)
- Cada msg: até 2 linhas (~120 chars)
- Tom HUMANO e natural — como top vendedor real
- Use PRIMEIRO NOME do lead
- Emojis: pressure=soft→1 emoji máx total; pressure=medium→1 por msg máx; pressure=direct→0-1 total
- Se decision_style=analytical: inclua dados/números quando possível
- Se decision_style=emotional: empatia e segurança
- Se decision_style=skeptical: transparência e provas sociais
- Se waiting_reply=true: foco em destravar resposta
- Se waiting_reply=false: foco em avançar etapa
- NUNCA "Olá" ou "Bom dia" genérico
- Se já enviou follow-ups, MUDE a abordagem
- CTA ÚNICO e claro por sequência (última msg)
- NUNCA prometa cobertura/valores sem confirmação

ESTRATÉGIAS: destravar_resposta, tratar_objecao, reforcar_valor, fechar_proxima_etapa, recuperar_lead_frio, acompanhar_processo, primeira_abordagem

NÃO retorne nada além do JSON.`,
          },
          {
            role: "user",
            content: `Analise e gere follow-up Brain Pro:\n\n${contextSummary}${userContext ? `\n\nCONTEXTO DO VENDEDOR:\n${userContext}` : ""}\n\nResponda APENAS com o JSON.`,
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
    let result: any = {};
    try {
      const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      // Fallback
      const msgs = rawContent.split("\n").filter((l: string) => l.trim().length > 0).slice(0, 4);
      result = {
        analysis: "Não foi possível analisar o contexto detalhadamente.",
        strategy: "destravar_resposta",
        goal: "Gerar resposta do cliente",
        messages: msgs.length > 0 ? msgs : [rawContent],
      };
    }

    // Ensure messages array is valid
    let messagesArray: string[] = Array.isArray(result.messages) ? result.messages : [rawContent];
    messagesArray = messagesArray.filter((m: string) => m && m.trim().length > 0).slice(0, 4);
    if (messagesArray.length < 2 && messagesArray[0]?.length > 200) {
      const words = messagesArray[0].split(" ");
      const mid = Math.ceil(words.length / 2);
      messagesArray = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
    }

    return new Response(JSON.stringify({
      analysis: result.analysis || "",
      strategy: result.strategy || "destravar_resposta",
      strategy_reason: result.goal || "",
      goal: result.goal || "",
      silence_stage: result.silence_stage || "early",
      pressure_level: result.pressure_level || "soft",
      flow_pattern: result.flow_pattern || "default",
      behavior: result.behavior || { decision_style: null, likely_objection: null, energy_level: null, confidence: "low" },
      guardrails: result.guardrails || { must_confirm_network: false, avoid_discount_promises: false, competitor_mode: false },
      urgency_flag: result.urgency_flag || false,
      messages: messagesArray,
      risk_flags: Array.isArray(result.risk_flags) ? result.risk_flags : [],
    }), {
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
