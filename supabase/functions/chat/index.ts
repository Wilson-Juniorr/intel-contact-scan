import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-actions-taken, x-action-names",
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
      name: "search_lead",
      description: "Busca leads pelo nome e retorna dados completos para confirmação do usuário ANTES de executar qualquer ação. SEMPRE use esta ferramenta primeiro.",
      parameters: {
        type: "object",
        properties: {
          lead_name: { type: "string", description: "Nome parcial ou completo do lead" },
        },
        required: ["lead_name"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_lead_stage",
      description: "Move um lead para uma nova etapa do funil. SÓ use após confirmação do usuário via search_lead.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "UUID do lead (obtido via search_lead)" },
          new_stage: {
            type: "string",
            enum: Object.keys(STAGE_LABELS),
            description: "Nova etapa: " + Object.entries(STAGE_LABELS).map(([k, v]) => `${k}=${v}`).join(", "),
          },
          lost_reason: { type: "string", description: "Motivo (obrigatório para declinado/cancelado)" },
        },
        required: ["lead_id", "new_stage"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_interaction",
      description: "Registra uma interação com um lead. SÓ use após confirmação do usuário.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "UUID do lead" },
          type: { type: "string", enum: ["call", "whatsapp", "meeting", "email", "note"], description: "Tipo da interação" },
          description: { type: "string", description: "Descrição da interação" },
        },
        required: ["lead_id", "type", "description"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Cria um lembrete/follow-up agendado. SÓ use após confirmação do usuário.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "UUID do lead" },
          date: { type: "string", description: "Data ISO 8601 (ex: 2025-03-15T10:00:00)" },
          description: { type: "string", description: "Descrição do lembrete" },
        },
        required: ["lead_id", "date", "description"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_note",
      description: "Adiciona uma observação/nota a um lead. SÓ use após confirmação do usuário.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "UUID do lead" },
          content: { type: "string", description: "Conteúdo da nota" },
          category: { type: "string", enum: ["geral", "negociacao", "documentacao", "reclamacao", "financeiro", "tecnico"] },
          tags: { type: "array", items: { type: "string" }, description: "Tags opcionais" },
        },
        required: ["lead_id", "content"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_document",
      description: "Atribui um documento enviado pelo usuário a um lead. SÓ use após confirmação do usuário.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "UUID do lead" },
          category: { type: "string", enum: ["rg_cpf", "comprovante_residencia", "cartao_sus", "contrato_social", "proposta", "declaracao_saude", "outros"] },
        },
        required: ["lead_id", "category"],
        additionalProperties: false,
      },
    },
  },
];

async function searchLeads(supabase: any, name: string) {
  const { data } = await supabase
    .from("leads")
    .select("id, name, phone, email, type, stage, operator, plan_type, lives, last_contact_at")
    .ilike("name", `%${name}%`)
    .limit(5);
  if (!data?.length) return { found: 0, leads: [], message: `Nenhum lead encontrado com "${name}"` };
  const results = data.map((l: any) => ({
    id: l.id,
    name: l.name,
    phone: l.phone,
    email: l.email || "-",
    type: l.type,
    stage: STAGE_LABELS[l.stage] || l.stage,
    operator: l.operator || "-",
    plan_type: l.plan_type || "-",
    lives: l.lives || "-",
  }));
  return { found: results.length, leads: results };
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
      case "search_lead": {
        return await searchLeads(supabase, params.lead_name);
      }
      case "move_lead_stage": {
        const update: any = { stage: params.new_stage };
        if (params.lost_reason) update.lost_reason = params.lost_reason;
        const { error } = await supabase.from("leads").update(update).eq("id", params.lead_id);
        if (error) return { error: error.message };
        return { success: true, message: `Lead movido para "${STAGE_LABELS[params.new_stage]}"` };
      }
      case "add_interaction": {
        const { error } = await supabase.from("interactions").insert({
          lead_id: params.lead_id, user_id: userId, type: params.type, description: params.description,
        });
        if (error) return { error: error.message };
        await supabase.from("leads").update({ last_contact_at: new Date().toISOString() }).eq("id", params.lead_id);
        return { success: true, message: `Interação registrada: ${params.description}` };
      }
      case "create_reminder": {
        const { error } = await supabase.from("reminders").insert({
          lead_id: params.lead_id, user_id: userId, date: params.date, description: params.description,
        });
        if (error) return { error: error.message };
        return { success: true, message: `Lembrete criado: ${params.description}` };
      }
      case "add_note": {
        const { error } = await supabase.from("lead_notes").insert({
          lead_id: params.lead_id, user_id: userId, content: params.content,
          category: params.category || "geral", tags: params.tags || [],
        });
        if (error) return { error: error.message };
        return { success: true, message: `Nota adicionada ao lead` };
      }
      case "assign_document": {
        if (!fileInfo) return { error: "Nenhum arquivo foi enviado com a mensagem" };
        const { error } = await supabase.from("lead_documents").insert({
          lead_id: params.lead_id, user_id: userId,
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

## AÇÕES DISPONÍVEIS:
- **search_lead**: Buscar lead pelo nome (SEMPRE use primeiro!)
- **move_lead_stage**: Mover lead de etapa no funil
- **add_interaction**: Registrar ligação, mensagem, reunião, email ou anotação
- **create_reminder**: Criar lembrete/follow-up agendado
- **add_note**: Adicionar observação/nota a um lead
- **assign_document**: Atribuir documento enviado a um lead

## REGRAS OBRIGATÓRIAS DE CONFIRMAÇÃO:
1. ANTES de qualquer ação, SEMPRE use search_lead primeiro para buscar o lead
2. Apresente os dados do lead encontrado ao usuário em formato organizado:
   - Nome completo, Telefone, Tipo (PF/PME/Adesão), Etapa atual, Operadora
3. Se encontrar MAIS DE UM lead, liste TODOS e pergunte qual é o correto
4. PEÇA CONFIRMAÇÃO explícita: "Confirma que deseja [ação] para este lead?"
5. SÓ execute a ação (move_lead_stage, add_interaction, etc.) DEPOIS que o usuário confirmar
6. Use o lead_id (UUID) retornado pelo search_lead para executar as ações
7. Se o usuário enviar um arquivo, pergunte a qual lead pertence e a categoria, mostre os dados e confirme

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
      const actionNames = choice.message.tool_calls.map((tc: any) => tc.function.name);
      const mutationNames = actionNames.filter((n: string) => n !== "search_lead");
      console.log("Tool calls:", actionNames);

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

      // Streaming follow-up with tool results (allow tools again for multi-step confirmation flow)
      const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: aiHeaders,
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [...allMessages, choice.message, ...toolResults],
          tools: CRM_TOOLS,
          stream: true,
        }),
      });

      if (!streamResponse.ok) {
        console.error("Follow-up error:", streamResponse.status);
        return new Response(JSON.stringify({ error: "Erro ao confirmar ação" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const hasRealActions = mutationNames.length > 0;
      return new Response(streamResponse.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          ...(hasRealActions ? {
            "x-actions-taken": "true",
            "x-action-names": mutationNames.join(","),
          } : {}),
        },
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
