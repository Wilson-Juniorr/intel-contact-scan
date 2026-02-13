import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STEP_CONFIG = [
  { step: 1, type: "reforco_valor", label: "Reforço de Valor", dayOffset: 1 },
  { step: 2, type: "tratamento_objecao", label: "Tratamento de Objeção", dayOffset: 3 },
  { step: 3, type: "direcionar_decisao", label: "Direcionamento de Decisão", dayOffset: 5 },
  { step: 4, type: "encerramento_elegante", label: "Encerramento Elegante", dayOffset: 7 },
];

const stageLabels: Record<string, string> = {
  novo: "Novo Negócio", tentativa_contato: "Tentativa de Contato",
  contato_realizado: "Contato Realizado", cotacao_enviada: "Cotação Enviada",
  cotacao_aprovada: "Cotação Aprovada", documentacao_completa: "Documentação Completa",
  em_emissao: "Em Emissão", aguardando_implantacao: "Aguardando Implantação",
  implantado: "Implantado", retrabalho: "Retrabalho",
  declinado: "Declinado", cancelado: "Cancelado",
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

    const { action, lead_id, step_id, sequence_id } = await req.json();

    // === ACTION: create — Start a new closing sequence ===
    if (action === "create") {
      if (!lead_id) throw new Error("lead_id required");

      // Check no active sequence exists
      const { data: existing } = await supabase
        .from("closing_sequences")
        .select("id, status")
        .eq("lead_id", lead_id)
        .in("status", ["active", "paused"])
        .maybeSingle();

      if (existing) {
        return new Response(JSON.stringify({ error: "Já existe uma sequência ativa para este lead", sequence_id: existing.id }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create sequence
      const { data: seq, error: seqErr } = await supabase
        .from("closing_sequences")
        .insert({ lead_id, user_id: userId, status: "active", current_step: 1 })
        .select()
        .single();
      if (seqErr) throw seqErr;

      // Create steps with scheduled dates
      const now = new Date();
      const steps = STEP_CONFIG.map((cfg) => ({
        sequence_id: seq.id,
        user_id: userId,
        step_number: cfg.step,
        step_type: cfg.type,
        scheduled_at: new Date(now.getTime() + cfg.dayOffset * 24 * 60 * 60 * 1000).toISOString(),
        status: cfg.step === 1 ? "ready" : "pending",
      }));

      const { error: stepsErr } = await supabase.from("closing_steps").insert(steps);
      if (stepsErr) throw stepsErr;

      // Generate AI content for step 1
      await generateStepContent(supabase, userId, lead_id, seq.id, 1);

      return new Response(JSON.stringify({ success: true, sequence_id: seq.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTION: generate — Generate/regenerate AI content for a step ===
    if (action === "generate") {
      if (!step_id) throw new Error("step_id required");

      const { data: step } = await supabase
        .from("closing_steps")
        .select("*, closing_sequences!inner(lead_id, status)")
        .eq("id", step_id)
        .single();
      if (!step) throw new Error("Step not found");

      const leadId = (step as any).closing_sequences.lead_id;
      await generateStepContent(supabase, userId, leadId, step.sequence_id, step.step_number);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === ACTION: pause — Pause the sequence ===
    if (action === "pause" && sequence_id) {
      await supabase.from("closing_sequences").update({ status: "paused", paused_at: new Date().toISOString() }).eq("id", sequence_id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === ACTION: resume — Resume a paused sequence ===
    if (action === "resume" && sequence_id) {
      const { data: seq } = await supabase.from("closing_sequences").select("*").eq("id", sequence_id).single();
      if (!seq) throw new Error("Sequence not found");

      // Recalculate scheduled_at for pending steps based on current date
      const { data: steps } = await supabase
        .from("closing_steps")
        .select("*")
        .eq("sequence_id", sequence_id)
        .in("status", ["pending", "ready"])
        .order("step_number");

      if (steps && steps.length > 0) {
        const now = new Date();
        for (let i = 0; i < steps.length; i++) {
          const cfg = STEP_CONFIG.find(c => c.step === steps[i].step_number);
          if (cfg) {
            const newSchedule = new Date(now.getTime() + (i + 1) * 2 * 24 * 60 * 60 * 1000).toISOString();
            await supabase.from("closing_steps").update({ scheduled_at: newSchedule }).eq("id", steps[i].id);
          }
        }
      }

      await supabase.from("closing_sequences").update({ status: "active", paused_at: null }).eq("id", sequence_id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === ACTION: cancel ===
    if (action === "cancel" && sequence_id) {
      await supabase.from("closing_sequences").update({ status: "cancelled" }).eq("id", sequence_id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === ACTION: mark_sent — Mark a step as sent ===
    if (action === "mark_sent" && step_id) {
      await supabase.from("closing_steps").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", step_id);
      
      // Advance sequence current_step
      const { data: step } = await supabase.from("closing_steps").select("sequence_id, step_number").eq("id", step_id).single();
      if (step) {
        const nextStep = step.step_number + 1;
        if (nextStep <= 4) {
          await supabase.from("closing_sequences").update({ current_step: nextStep }).eq("id", step.sequence_id);
          // Mark next step as ready and generate content
          const { data: nextStepData } = await supabase
            .from("closing_steps")
            .select("id")
            .eq("sequence_id", step.sequence_id)
            .eq("step_number", nextStep)
            .single();
          if (nextStepData) {
            await supabase.from("closing_steps").update({ status: "ready" }).eq("id", nextStepData.id);
            // Get lead_id for content generation
            const { data: seqData } = await supabase.from("closing_sequences").select("lead_id").eq("id", step.sequence_id).single();
            if (seqData) {
              await generateStepContent(supabase, userId, seqData.lead_id, step.sequence_id, nextStep);
            }
          }
        } else {
          // All steps done
          await supabase.from("closing_sequences").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", step.sequence_id);
        }
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (e) {
    console.error("closing-engine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function generateStepContent(supabase: any, userId: string, leadId: string, sequenceId: string, stepNumber: number) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return;

  // Load lead + context
  const [leadRes, memoryRes, msgsRes, prevStepsRes] = await Promise.all([
    supabase.from("leads").select("*").eq("id", leadId).single(),
    supabase.from("lead_memory").select("summary, structured_json").eq("lead_id", leadId).maybeSingle(),
    supabase.from("whatsapp_messages").select("direction, content, extracted_text, created_at").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(20),
    supabase.from("closing_steps").select("step_type, generated_message, status").eq("sequence_id", sequenceId).lt("step_number", stepNumber).order("step_number"),
  ]);

  const lead = leadRes.data;
  if (!lead) return;

  const stepCfg = STEP_CONFIG.find(c => c.step === stepNumber);
  if (!stepCfg) return;

  const firstName = lead.name.split(" ")[0];
  const recentMsgs = (msgsRes.data || []).reverse()
    .map((m: any) => `${m.direction === "outbound" ? "EU" : "CLIENTE"}: ${(m.extracted_text || m.content || "[mídia]").slice(0, 150)}`)
    .join("\n");

  const prevSteps = (prevStepsRes.data || [])
    .filter((s: any) => s.generated_message)
    .map((s: any) => `[${s.step_type}] ${s.generated_message}`)
    .join("\n");

  const systemPrompt = `Você é um closer expert de planos de saúde via WhatsApp. Gere UMA mensagem para a etapa "${stepCfg.label}" (etapa ${stepNumber} de 4) da sequência de fechamento.

CONTEXTO DO LEAD:
- Nome: ${lead.name} (primeiro nome: ${firstName})
- Etapa: ${stageLabels[lead.stage] || lead.stage}
- Tipo: ${lead.type} | Operadora: ${lead.operator || "?"} | Vidas: ${lead.lives || "?"}
- Cotação: R$${lead.quote_min_value || "?"} | Operadora cotação: ${lead.quote_operadora || "?"}
${memoryRes.data?.summary ? `- Memória: ${memoryRes.data.summary.slice(0, 300)}` : ""}

HISTÓRICO RECENTE:
${recentMsgs || "(sem mensagens)"}

${prevSteps ? `MENSAGENS ANTERIORES DA SEQUÊNCIA:\n${prevSteps}` : ""}

REGRAS POR ETAPA:
1. Reforço de Valor: Destaque benefícios concretos da proposta enviada. Valor, cobertura, diferencial.
2. Tratamento de Objeção: Antecipe objeções (preço, carência, rede). Ofereça solução proativa.
3. Direcionamento de Decisão: Crie senso de urgência real (reajuste, vigência, vagas). Pergunte diretamente.
4. Encerramento Elegante: Última chance. Tom respeitoso mas firme. Deixe porta aberta.

FORMATO:
- Mensagem curta (máx 3 linhas, ~150 chars)
- Tom natural e humano, sem "Olá" ou "Bom dia" genérico
- Use o primeiro nome: ${firstName}
- Emojis moderados (1-2 máximo)

Responda APENAS com JSON:
{
  "analysis": "Breve análise do momento do lead (1-2 frases)",
  "message": "A mensagem para enviar",
  "tip": "Dica tática para o vendedor (1 frase)"
}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Gere a mensagem para a etapa ${stepNumber}: ${stepCfg.label}` },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI error:", response.status, await response.text());
      return;
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      await supabase.from("closing_steps").update({
        ai_analysis: parsed.analysis || null,
        generated_message: parsed.message || null,
      }).eq("sequence_id", sequenceId).eq("step_number", stepNumber);
    }
  } catch (e) {
    console.error("AI generation error:", e);
  }
}
