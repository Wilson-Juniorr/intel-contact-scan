import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STAGE_LABELS: Record<string, string> = {
  novo: "Novo Negócio",
  tentativa_contato: "Tentativa de Contato",
  contato_realizado: "Contato Realizado",
  cotacao_enviada: "Cotação Enviada",
  cotacao_aprovada: "Cotação Aprovada",
  documentacao_completa: "Documentação Completa",
  em_emissao: "Em Emissão",
  aguardando_implantacao: "Aguardando Implantação",
  implantado: "Implantado",
  retrabalho: "Retrabalho",
  declinado: "Declinado",
  cancelado: "Cancelado",
};

const CRM_TOOLS = [
  {
    type: "function",
    function: {
      name: "move_lead_stage",
      description: "Move um lead para uma nova etapa do funil de vendas.",
      parameters: {
        type: "object",
        properties: {
          lead_name: { type: "string", description: "Nome do lead (parcial ou completo)" },
          new_stage: {
            type: "string",
            enum: Object.keys(STAGE_LABELS),
            description: "Nova etapa: " + Object.entries(STAGE_LABELS).map(([k, v]) => `${k}=${v}`).join(", "),
          },
          lost_reason: { type: "string", description: "Motivo (obrigatório para declinado/cancelado)" },
        },
        required: ["lead_name", "new_stage"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_interaction",
      description: "Registra uma interação com um lead (ligação, mensagem, reunião, email ou anotação).",
      parameters: {
        type: "object",
        properties: {
          lead_name: { type: "string", description: "Nome do lead" },
          type: { type: "string", enum: ["call", "whatsapp", "meeting", "email", "note"], description: "Tipo da interação" },
          description: { type: "string", description: "Descrição da interação" },
        },
        required: ["lead_name", "type", "description"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Cria um lembrete/follow-up agendado para um lead.",
      parameters: {
        type: "object",
        properties: {
          lead_name: { type: "string", description: "Nome do lead" },
          date: { type: "string", description: "Data ISO 8601 (ex: 2025-03-15T10:00:00)" },
          description: { type: "string", description: "Descrição do lembrete" },
        },
        required: ["lead_name", "date", "description"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_note",
      description: "Adiciona uma observação/nota a um lead.",
      parameters: {
        type: "object",
        properties: {
          lead_name: { type: "string", description: "Nome do lead" },
          content: { type: "string", description: "Conteúdo da nota" },
          category: { type: "string", enum: ["geral", "negociacao", "documentacao", "reclamacao", "financeiro", "tecnico"] },
          tags: { type: "array", items: { type: "string" }, description: "Tags opcionais" },
        },
        required: ["lead_name", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_document",
      description: "Atribui um documento enviado pelo usuário a um lead.",
      parameters: {
        type: "object",
        properties: {
          lead_name: { type: "string", description: "Nome do lead" },
          category: { type: "string", enum: ["rg_cpf", "comprovante_residencia", "cartao_sus", "contrato_social", "proposta", "declaracao_saude", "outros"] },
        },
        required: ["lead_name", "category"],
        additionalProperties: false,
      },
    },
  },
];

async function findLeadByName(supabase: any, name: string) {
  const { data } = await supabase
    .from("leads")
    .select("id, name")
    .ilike("name", `%${name}%`)
    .limit(5);
  if (!data?.length) return null;
  return data.find((l: any) => l.name.toLowerCase() === name.toLowerCase()) || data[0];
}

async function executeTool(supabase: any, userId: string, toolCall: any, fileInfo?: any) {
  const fnName = toolCall.function.name;
  let params: any;
  try {
    params = JSON.parse(toolCall.function.arguments);
  } catch {
    return { error: "Argumentos inválidos" };
  }

  try {
    switch (fnName) {
      case "move_lead_stage": {
        const lead = await findLeadByName(supabase, params.lead_name);
        if (!lead) return { error: `Lead "${params.lead_name}" não encontrado` };
        const update: any = { stage: params.new_stage };
        if (params.lost_reason) update.lost_reason = params.lost_reason;
        const { error } = await supabase.from("leads").update(update).eq("id", lead.id);
        if (error) return { error: error.message };
        return { success: true, message: `Lead "${lead.name}" movido para "${STAGE_LABELS[params.new_stage]}"` };
      }
      case "add_interaction": {
        const lead = await findLeadByName(supabase, params.lead_name);
        if (!lead) return { error: `Lead "${params.lead_name}" não encontrado` };
        const { error } = await supabase.from("interactions").insert({
          lead_id: lead.id, user_id: userId, type: params.type, description: params.description,
        });
        if (error) return { error: error.message };
        await supabase.from("leads").update({ last_contact_at: new Date().toISOString() }).eq("id", lead.id);
        return { success: true, message: `Interação registrada para "${lead.name}": ${params.description}` };
      }
      case "create_reminder": {
        const lead = await findLeadByName(supabase, params.lead_name);
        if (!lead) return { error: `Lead "${params.lead_name}" não encontrado` };
        const { error } = await supabase.from("reminders").insert({
          lead_id: lead.id, user_id: userId, date: params.date, description: params.description,
        });
        if (error) return { error: error.message };
        return { success: true, message: `Lembrete criado para "${lead.name}": ${params.description}` };
      }
      case "add_note": {
        const lead = await findLeadByName(supabase, params.lead_name);
        if (!lead) return { error: `Lead "${params.lead_name}" não encontrado` };
        const { error } = await supabase.from("lead_notes").insert({
          lead_id: lead.id, user_id: userId, content: params.content,
          category: params.category || "geral", tags: params.tags || [],
        });
        if (error) return { error: error.message };
        return { success: true, message: `Nota adicionada ao lead "${lead.name}"` };
      }
      case "assign_document": {
        if (!fileInfo) return { error: "Nenhum arquivo foi enviado com a mensagem" };
        const lead = await findLeadByName(supabase, params.lead_name);
        if (!lead) return { error: `Lead "${params.lead_name}" não encontrado` };
        const { error } = await supabase.from("lead_documents").insert({
          lead_id: lead.id, user_id: userId,
          file_name: fileInfo.file_name, file_path: fileInfo.file_path,
          file_type: fileInfo.file_type, file_size: fileInfo.file_size,
          category: params.category,
        });
        if (error) return { error: error.message };
        return { success: true, message: `Documento "${fileInfo.file_name}" atribuído ao lead "${lead.name}" (${params.category})` };
      }
      default:
        return { error: `Ferramenta desconhecida: ${fnName}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, crmContext, fileInfo } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const userToken = req.headers.get("x-user-token");

    let userId: string | null = null;
    let supabase: any = null;

    if (userToken) {
      supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${userToken}` } } }
      );
      const { data: { user } } = await supabase.auth.getUser(userToken);
      userId = user?.id || null;
    }

    const fileContext = fileInfo
      ? `\n\n## ARQUIVO ENVIADO PELO USUÁRIO:\nNome: ${fileInfo.file_name}\nTipo: ${fileInfo.file_type}\nTamanho: ${fileInfo.file_size ? Math.round(fileInfo.file_size / 1024) + "KB" : "?"}\n\nPergunte ao usuário a qual lead este documento pertence e qual a categoria (RG/CPF, Comprovante de Residência, Cartão SUS, Contrato Social, Proposta, Declaração de Saúde, Outros).`
      : "";

    const systemContent = `Você é um assistente especialista em planos de saúde no Brasil. Seu nome é CRM Saúde IA.

Você tem ACESSO TOTAL aos dados do CRM e pode EXECUTAR AÇÕES diretamente no sistema.

## AÇÕES DISPONÍVEIS (use as ferramentas/tools quando necessário):
- **move_lead_stage**: Mover lead de etapa no funil
- **add_interaction**: Registrar ligação, mensagem, reunião, email ou anotação
- **create_reminder**: Criar lembrete/follow-up agendado
- **add_note**: Adicionar observação/nota a um lead
- **assign_document**: Atribuir documento enviado a um lead

## REGRAS:
1. Quando o usuário pedir claramente uma ação, EXECUTE IMEDIATAMENTE usando as ferramentas
2. Se houver ambiguidade no nome do lead (mais de um com nome similar), pergunte qual
3. Após executar, confirme com um resumo claro do que foi feito
4. Se o usuário enviar um arquivo, pergunte a qual lead pertence e a categoria

## CONHECIMENTOS:
- Operadoras (Unimed, Amil, Bradesco Saúde, SulAmérica, Hapvida, Porto Seguro, etc.)
- Carências, coberturas, reajustes e regras da ANS
- Diferenças entre planos PF, PJ, PME
- Estratégias de venda e mensagens de follow-up

Seja direto e prático. Use linguagem acessível.
${fileContext}

${crmContext || "Nenhum dado do CRM disponível."}`;

    const allMessages = [
      { role: "system", content: systemContent },
      ...messages,
    ];

    const aiHeaders = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    };

    // Non-streaming request with tools to detect actions
    const firstResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: aiHeaders,
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: allMessages,
        tools: userId ? CRM_TOOLS : undefined,
        stream: false,
      }),
    });

    if (!firstResponse.ok) {
      if (firstResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (firstResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await firstResponse.text();
      console.error("AI gateway error:", firstResponse.status, t);
      return new Response(JSON.stringify({ error: "Erro no assistente IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firstResult = await firstResponse.json();
    const choice = firstResult.choices?.[0];

    // Tool calls detected - execute actions
    if (choice?.message?.tool_calls?.length > 0 && supabase && userId) {
      console.log("Tool calls:", choice.message.tool_calls.map((tc: any) => tc.function.name));

      const toolResults = [];
      for (const tc of choice.message.tool_calls) {
        const result = await executeTool(supabase, userId, tc, fileInfo);
        console.log(`Tool ${tc.function.name}:`, result);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }

      // Streaming follow-up with tool results
      const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: aiHeaders,
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [...allMessages, choice.message, ...toolResults],
          stream: true,
        }),
      });

      if (!streamResponse.ok) {
        console.error("Follow-up error:", streamResponse.status);
        return new Response(JSON.stringify({ error: "Erro ao confirmar ação" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(streamResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "x-actions-taken": "true" },
      });
    }

    // No tool calls - return content as SSE
    const content = choice?.message?.content || "Desculpe, não consegui processar.";
    const chunks: string[] = [];
    const chunkSize = 30;
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + chunkSize) } }] })}\n\n`);
    }
    chunks.push("data: [DONE]\n\n");

    return new Response(chunks.join(""), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
