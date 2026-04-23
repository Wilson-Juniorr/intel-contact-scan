// Classifica o contexto da conversa em 8 categorias para decidir se a Camila/SDR
// pode entrar. Lê últimas 10 mensagens, chama Gemini via Lovable AI Gateway,
// grava categoria em whatsapp_contacts (se confianca >= 0.85) + histórico.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-3-flash-preview";
const CONFIDENCE_AUTOSAVE = 0.85;
const CATEGORIES = [
  "lead_novo","lead_retorno","personal","team","partner","vendor","spam","ambiguo",
] as const;
type Category = typeof CATEGORIES[number];

const CLASSIFIER_SYSTEM_PROMPT = `Você é um CLASSIFICADOR de contexto de conversa WhatsApp para o Junior, corretor de planos de saúde e seguros da Praticcar (São Paulo).

Sua única função: decidir em QUE CONTEXTO essa conversa está acontecendo, para que um assistente de vendas (SDR automática) saiba se deve ou não entrar.

═══ CATEGORIAS POSSÍVEIS (retorne UMA) ═══

• lead_novo     — pessoa NOVA interessada em plano de saúde/seguro; primeira vez falando; quer cotação/orçamento/proposta; dúvida sobre plano próprio; reajuste da própria mensalidade; PF ou PJ/PME
• lead_retorno  — ex-cliente ou lead antigo voltando; menciona "já falei com vocês", "sou cliente de vocês", "mudei de plano e quero voltar"; renovação; sinistro
• personal      — família, amigo, relacionamento pessoal; assuntos íntimos; convites sociais; piadas; cumprimento sem contexto comercial
• team          — gente que TRABALHA COM Junior: supervisora, colega, sócio; conversa operacional; "responde lá o do José"; passagem de caso; combinados internos; falar DE UM CLIENTE terceiro
• partner       — corretora parceira, operadora (Amil, Unimed, Bradesco, Sulamérica, Hapvida, NotreDame), administradora, broker; comissão, produção, repasse; processo interno entre profissionais do mercado
• vendor        — fornecedor: contador, advogado, designer, dev, suporte de sistema (Lovable, UAZAPI), banco, SaaS
• spam          — spam, robô de empresa, engano, trote, mensagem vazia, promoção aleatória
• ambiguo       — SÓ use se realmente não dá pra decidir com as evidências

═══ REGRAS DE DECISÃO ═══

1. Pessoa falando de UM CLIENTE (terceiro) → team ou partner, NUNCA lead.
   Ex: "manda proposta do José", "liga no cliente" → team/partner.

2. Pessoa falando DA PRÓPRIA SAÚDE/PRÓPRIO PLANO → lead_novo ou lead_retorno.
   Ex: "meu plano tá caro", "quero cotar pra minha família", "tô na Amil e quero mudar" → lead_novo.
   Ex: "sou cliente de vocês desde 2020, quero rever" → lead_retorno.

3. Áudio NÃO é sinal de lead. Supervisora manda áudio também.
   Avalie SEMPRE pelo conteúdo da fala, não pelo formato.

4. Cumprimento isolado ("bom dia", "oi", "tudo bem?") SEM contexto comercial:
   - contato novo → ambiguo
   - contato conhecido → personal

5. Se o NOME DO CONTATO for "Naiane", "Supervisora", "Dra", "Dr", nome de empresa conhecida (Amil, Unimed, etc) — priorize team/partner.

6. Mencionar nome de operadora NÃO significa lead.
   "deu ruim na Unimed" (team) ≠ "quero Unimed" (lead_novo).

7. Se confiança < 0.7, prefira "ambiguo" a chutar.

═══ FORMATO DE SAÍDA (JSON ESTRITO, NADA MAIS) ═══

{
  "categoria": "lead_novo" | "lead_retorno" | "personal" | "team" | "partner" | "vendor" | "spam" | "ambiguo",
  "e_lead": true | false,
  "confianca": 0.00-1.00,
  "razao": "1 frase explicando o porquê em português",
  "sinais": ["evidência", "textual", "da", "conversa"]
}`;

function normalizePhone(phone: string): string {
  const d = String(phone).replace(/\D/g, "");
  return d.startsWith("55") ? d : `55${d}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { phone, user_id, force_reclassify } = await req.json();
    if (!phone || !user_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "phone e user_id obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalized = normalizePhone(phone);

    const { data: contact } = await supabase
      .from("whatsapp_contacts")
      .select("id, contact_name, category, category_source")
      .eq("user_id", user_id)
      .eq("phone", normalized)
      .maybeSingle();

    if (contact?.category && contact.category_source === "manual" && !force_reclassify) {
      return new Response(
        JSON.stringify({ ok: true, cached: true, categoria: contact.category, source: "manual" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: msgs } = await supabase
      .from("whatsapp_messages")
      .select("direction, content, message_type, created_at")
      .eq("user_id", user_id)
      .eq("phone", normalized)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!msgs || msgs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, categoria: "ambiguo", confianca: 0, razao: "sem_historico" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const conversa = [...msgs].reverse().map((m: any) =>
      `${m.direction === "inbound" ? "CONTATO" : "JUNIOR"}: ${(m.content || `[${m.message_type}]`).slice(0, 300)}`
    ).join("\n");

    const userMsg = `Nome do contato: ${contact?.contact_name || "desconhecido"}
Telefone: ${normalized}

Últimas mensagens (mais recente por último):
${conversa}

Classifique. Responda APENAS o JSON.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 250,
        temperature: 0.1,
        messages: [
          { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      if (resp.status === 429 || resp.status === 402) {
        return new Response(
          JSON.stringify({ ok: false, error: "ai_gateway_limit", status: resp.status }),
          { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Gemini error ${resp.status}: ${t.slice(0, 300)}`);
    }

    const data = await resp.json();
    const raw: string = data.choices?.[0]?.message?.content ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Gemini não retornou JSON: " + raw.slice(0, 200));

    let parsed: any;
    try { parsed = JSON.parse(match[0]); }
    catch { throw new Error("JSON inválido: " + match[0].slice(0, 200)); }

    const categoria: Category = (CATEGORIES as readonly string[]).includes(parsed.categoria)
      ? parsed.categoria
      : "ambiguo";
    const confianca = Math.min(Math.max(Number(parsed.confianca ?? 0), 0), 1);
    const razao = String(parsed.razao ?? "").slice(0, 500);
    const sinais = Array.isArray(parsed.sinais)
      ? parsed.sinais.slice(0, 8).map((s: any) => String(s).slice(0, 200))
      : [];

    await supabase.from("conversation_classifications").insert({
      user_id,
      contact_id: contact?.id ?? null,
      phone: normalized,
      categoria,
      confianca,
      razao,
      sinais,
      modelo: MODEL,
      mensagens_analisadas: msgs.length,
    });

    if (confianca >= CONFIDENCE_AUTOSAVE && contact) {
      await supabase.from("whatsapp_contacts").update({
        category: categoria,
        category_confidence: confianca,
        category_classified_at: new Date().toISOString(),
        category_source: "llm",
      }).eq("id", contact.id);
    }

    if (categoria === "ambiguo" && contact) {
      await supabase.from("notifications").insert({
        user_id,
        type: "classificacao_ambigua",
        title: "Conversa precisa da sua classificação",
        body: `Contato "${contact.contact_name || normalized}" — não consegui identificar se é lead. Razão: ${razao.slice(0, 150)}`,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        categoria,
        confianca,
        razao,
        sinais,
        saved: confianca >= CONFIDENCE_AUTOSAVE,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("classify-conversation error:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});