import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text is required" }), { status: 400, headers: corsHeaders });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: corsHeaders });
    }

    const prompt = `Analise o texto abaixo, que foi extraído de uma cotação/proposta de plano de saúde.

Extraia as seguintes informações:
1. **min_value**: O MENOR valor mensal encontrado (número decimal, sem R$). Se houver múltiplos planos/faixas, pegue o menor valor individual.
2. **operadora**: Nome da operadora (ex: Amil, Bradesco Saúde, SulAmérica, etc.)
3. **plan_name**: Nome do plano (ex: Amil 400, Blue I, etc.)

Retorne APENAS um JSON válido no formato:
{"min_value": 299.90, "operadora": "Amil", "plan_name": "Amil 400", "confidence": 0.9}

Se não conseguir extrair o valor mínimo, retorne:
{"min_value": null, "operadora": null, "plan_name": null, "confidence": 0}

O campo "confidence" deve ser entre 0 e 1:
- 0.9+ se o valor está claro e inequívoco
- 0.5-0.8 se o valor foi inferido ou ambíguo
- 0 se não encontrou valor

TEXTO DA COTAÇÃO:
${text.slice(0, 8000)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("AI error:", response.status);
      return new Response(JSON.stringify({ min_value: null, operadora: null, plan_name: null, confidence: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const raw = aiData.choices?.[0]?.message?.content?.trim() || "";

    // Extract JSON from response (may be wrapped in markdown)
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ min_value: null, operadora: null, plan_name: null, confidence: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return new Response(JSON.stringify({
      min_value: typeof parsed.min_value === "number" ? parsed.min_value : null,
      operadora: parsed.operadora || null,
      plan_name: parsed.plan_name || null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-quote-data error:", error);
    return new Response(JSON.stringify({ min_value: null, operadora: null, plan_name: null, confidence: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
