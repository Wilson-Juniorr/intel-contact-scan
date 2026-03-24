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
      name: "get_whatsapp_history",
      description: "Busca o histórico completo de conversas do WhatsApp de um contato/lead. Inclui textos, transcrições de áudio (🎤) e descrições de imagem. Use para entender o contexto da conversa antes de sugerir follow-ups ou ações.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Número de telefone (com ou sem 55)" },
          lead_name: { type: "string", description: "Nome do lead/contato para buscar o telefone" },
          limit: { type: "number", description: "Quantidade de mensagens (padrão: 50, máx: 200)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_silent_contacts",
      description: "Identifica contatos/leads que não responderam há X dias. Útil para gerar listas de follow-up. Retorna contatos ordenados pelo tempo de silêncio (mais antigos primeiro).",
      parameters: {
        type: "object",
        properties: {
          days_without_response: { type: "number", description: "Mínimo de dias sem resposta do cliente (padrão: 3)" },
          limit: { type: "number", description: "Quantidade máxima de resultados (padrão: 20)" },
        },
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
      case "get_whatsapp_history": {
        let phone = params.phone?.replace(/\D/g, "") || "";
        
        // If no phone, search by lead name
        if (!phone && params.lead_name) {
          const { data: leads } = await supabase
            .from("leads")
            .select("phone, name")
            .ilike("name", `%${params.lead_name}%`)
            .limit(1);
          if (leads?.length) {
            phone = leads[0].phone.replace(/\D/g, "");
          }
          
          // Also check whatsapp_contacts
          if (!phone) {
            const { data: contacts } = await supabase
              .from("whatsapp_contacts")
              .select("phone, contact_name")
              .ilike("contact_name", `%${params.lead_name}%`)
              .limit(1);
            if (contacts?.length) phone = contacts[0].phone;
          }
        }
        
        if (!phone) return { error: `Contato não encontrado: ${params.lead_name || params.phone}` };
        
        // Normalize phone
        const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;
        const limit = Math.min(params.limit || 50, 200);
        
        const { data: msgs } = await supabase
          .from("whatsapp_messages")
          .select("direction, message_type, content, created_at, contact_name")
          .eq("phone", normalizedPhone)
          .order("created_at", { ascending: false })
          .limit(limit);
        
        if (!msgs?.length) {
          // Try without 55 prefix
          const { data: msgs2 } = await supabase
            .from("whatsapp_messages")
            .select("direction, message_type, content, created_at, contact_name")
            .eq("phone", phone)
            .order("created_at", { ascending: false })
            .limit(limit);
          
          if (!msgs2?.length) return { found: 0, message: `Nenhuma mensagem encontrada para ${normalizedPhone}` };
          msgs?.push(...(msgs2 || []));
        }
        
        // Format messages chronologically
        const formatted = (msgs || []).reverse().map((m: any) => {
          const dir = m.direction === "outbound" ? "→ EU" : "← CLIENTE";
          const type = m.message_type !== "text" ? ` [${m.message_type}]` : "";
          const time = new Date(m.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
          return `${time} ${dir}${type}: ${m.content || "[Mídia sem texto]"}`;
        });
        
        return {
          found: formatted.length,
          phone: normalizedPhone,
          contactName: msgs?.[0]?.contact_name || null,
          messages: formatted,
        };
      }
      case "detect_silent_contacts": {
        const minDays = params.days_without_response || 3;
        const limit = Math.min(params.limit || 20, 50);
        const cutoff = new Date(Date.now() - minDays * 24 * 60 * 60 * 1000).toISOString();
        
        // Get all phones with their last inbound (client response) message
        const { data: allMsgs } = await supabase
          .from("whatsapp_messages")
          .select("phone, direction, created_at, contact_name")
          .order("created_at", { ascending: false });
        
        if (!allMsgs?.length) return { found: 0, message: "Nenhuma mensagem encontrada" };
        
        // Group by phone: find last outbound (our msg) and last inbound (client response)
        const phoneMap = new Map<string, { lastOutbound: string | null; lastInbound: string | null; contactName: string | null }>();
        for (const m of allMsgs) {
          if (!phoneMap.has(m.phone)) {
            phoneMap.set(m.phone, { lastOutbound: null, lastInbound: null, contactName: m.contact_name });
          }
          const entry = phoneMap.get(m.phone)!;
          if (!entry.contactName && m.contact_name) entry.contactName = m.contact_name;
          if (m.direction === "outbound" && !entry.lastOutbound) entry.lastOutbound = m.created_at;
          if (m.direction === "inbound" && !entry.lastInbound) entry.lastInbound = m.created_at;
        }
        
        // Find contacts where: we sent something, client hasn't responded since
        const silentContacts: any[] = [];
        for (const [phone, data] of phoneMap) {
          if (!data.lastOutbound) continue; // We never messaged them
          
          // Client never responded, or responded before our last message
          const clientSilent = !data.lastInbound || new Date(data.lastInbound) < new Date(data.lastOutbound);
          if (!clientSilent) continue;
          
          // Check if our last outbound is older than cutoff
          if (new Date(data.lastOutbound) > new Date(cutoff)) continue;
          
          const daysSilent = Math.floor((Date.now() - new Date(data.lastOutbound).getTime()) / (1000 * 60 * 60 * 24));
          
          silentContacts.push({
            phone,
            contactName: data.contactName || phone,
            daysSilent,
            lastOutbound: new Date(data.lastOutbound).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
            lastInbound: data.lastInbound 
              ? new Date(data.lastInbound).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) 
              : "Nunca respondeu",
          });
        }
        
        silentContacts.sort((a, b) => b.daysSilent - a.daysSilent);
        
        return {
          found: silentContacts.length,
          minDaysFilter: minDays,
          contacts: silentContacts.slice(0, limit),
        };
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
        return { success: true, message: `Documento atribuído ao lead (${params.category})` };
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
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

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

    // Load lead_memory if a lead is referenced in crmContext
    let leadMemoryContext = "";
    if (supabase && userId && crmContext) {
      // Try to extract lead_id from crmContext (format: "Lead selecionado: NAME (ID: UUID)")
      const leadIdMatch = crmContext.match(/ID:\s*([0-9a-f-]{36})/i);
      if (leadIdMatch) {
        const selLeadId = leadIdMatch[1];
        const { data: mem } = await supabase
          .from("lead_memory")
          .select("summary, structured_json")
          .eq("lead_id", selLeadId)
          .maybeSingle();

        if (mem?.summary) {
          leadMemoryContext = `\n\n## MEMÓRIA DO LEAD (resumo atualizado pela IA):\n${mem.summary}`;
          if (mem.structured_json && typeof mem.structured_json === "object") {
            const sj = mem.structured_json as any;
            const parts: string[] = [];
            if (sj.orcamento) parts.push(`Orçamento: ${sj.orcamento}`);
            if (sj.rede_hospitais?.length) parts.push(`Rede desejada: ${sj.rede_hospitais.join(", ")}`);
            if (sj.objecoes?.length) parts.push(`Objeções: ${sj.objecoes.join(", ")}`);
            if (sj.sentimento) parts.push(`Sentimento: ${sj.sentimento}`);
            if (sj.operadoras_discutidas?.length) parts.push(`Operadoras discutidas: ${sj.operadoras_discutidas.join(", ")}`);
            if (sj.proximos_passos?.length) parts.push(`Próximos passos: ${sj.proximos_passos.join(", ")}`);
            if (parts.length) leadMemoryContext += `\nDADOS ESTRUTURADOS:\n${parts.join("\n")}`;
          }
        }
      }
    }

    const systemContent = `Você é um assistente especialista em planos de saúde no Brasil. Seu nome é CRM Saúde IA.

Você tem ACESSO TOTAL aos dados do CRM E às conversas do WhatsApp. Pode EXECUTAR AÇÕES diretamente.

## AÇÕES DISPONÍVEIS:
- **search_lead**: Buscar lead pelo nome (SEMPRE use primeiro!)
- **get_whatsapp_history**: Buscar histórico de conversa WhatsApp (inclui textos, transcrições de áudio 🎤, descrições de imagens 🖼️ e análises de PDFs/documentos 📄)
- **detect_silent_contacts**: Identificar contatos que não responderam há X dias — ESSENCIAL para gerar listas de follow-up
- **move_lead_stage**: Mover lead de etapa no funil
- **add_interaction**: Registrar ligação, mensagem, reunião, email ou anotação
- **create_reminder**: Criar lembrete/follow-up agendado
- **add_note**: Adicionar observação/nota a um lead
- **assign_document**: Atribuir documento enviado a um lead

## INTELIGÊNCIA WHATSAPP COMPLETA:
- Você tem acesso ao histórico COMPLETO de conversas WhatsApp (incluindo mensagens enviadas pelo celular)
- Transcrições de áudio aparecem com prefixo 🎤
- Descrições de imagens aparecem com prefixo 🖼️ (propostas, tabelas de preço, prints)
- Análises de PDFs/documentos aparecem com prefixo 📄 (propostas completas com valores, rede, coberturas)
- Ao sugerir follow-ups, SEMPRE busque o histórico primeiro para entender contexto
- Use detect_silent_contacts para identificar quem precisa de follow-up
- Analise o tom, interesse e objeções do cliente nas mensagens
- Sugira abordagens personalizadas baseadas no que o cliente disse E no que foi enviado (propostas, imagens)

## MEMÓRIA DO LEAD:
- Quando houver memória do lead disponível, USE-A para dar respostas contextualizadas
- A memória contém resumo da negociação, objeções, orçamento, operadoras discutidas, sentimento do cliente
- Isso permite que você dê conselhos ESPECÍFICOS e personalizados

## REGRAS OBRIGATÓRIAS DE CONFIRMAÇÃO:
1. ANTES de qualquer ação, SEMPRE use search_lead primeiro para buscar o lead
2. Apresente os dados do lead encontrado ao usuário em formato organizado
3. Se encontrar MAIS DE UM lead, liste TODOS e pergunte qual é o correto
4. PEÇA CONFIRMAÇÃO explícita: "Confirma que deseja [ação] para este lead?"
5. SÓ execute a ação DEPOIS que o usuário confirmar
6. Se o usuário enviar um arquivo, pergunte a qual lead pertence e a categoria

## CONHECIMENTOS:
- Operadoras (Unimed, Amil, Bradesco Saúde, SulAmérica, Hapvida, Porto Seguro, etc.)
- Carências, coberturas, reajustes e regras da ANS
- Diferenças entre planos PF, PJ, PME
- Estratégias de venda e mensagens de follow-up

Seja direto e prático. Use linguagem acessível.
${fileContext}
${leadMemoryContext}

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

    // Tool calls detected - execute in a loop (supports multi-step: search → confirm → execute)
    if (choice?.message?.tool_calls?.length > 0 && supabase && userId) {
      let currentMessages = [...allMessages];
      let currentChoice = choice;
      const allActionNames: string[] = [];
      const MAX_ROUNDS = 5;

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const actionNames = currentChoice.message.tool_calls.map((tc: any) => tc.function.name);
        console.log(`Tool calls round ${round}:`, actionNames);
        allActionNames.push(...actionNames);

        const toolResults = [];
        for (const tc of currentChoice.message.tool_calls) {
          const result = await executeTool(supabase, userId, tc, fileInfo);
          console.log(`Tool ${tc.function.name}:`, result);
          toolResults.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }

        currentMessages = [...currentMessages, currentChoice.message, ...toolResults];

        // Check if AI wants to call more tools (non-streaming)
        const nextResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: aiHeaders,
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: currentMessages,
            tools: CRM_TOOLS,
            stream: false,
          }),
        });

        if (!nextResponse.ok) {
          console.error("Follow-up error:", nextResponse.status);
          return new Response(JSON.stringify({ error: "Erro ao processar ação" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const nextResult = await nextResponse.json();
        currentChoice = nextResult.choices?.[0];

        // If no more tool calls, stream the final text response
        if (!currentChoice?.message?.tool_calls?.length) {
          const content = currentChoice?.message?.content || "Ação processada.";
          const mutationNames = allActionNames.filter((n) => n !== "search_lead");
          const chunks: string[] = [];
          const chunkSize = 30;
          for (let i = 0; i < content.length; i += chunkSize) {
            chunks.push(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + chunkSize) } }] })}\n\n`);
          }
          chunks.push("data: [DONE]\n\n");

          return new Response(chunks.join(""), {
            headers: {
              ...corsHeaders,
              "Content-Type": "text/event-stream",
              ...(mutationNames.length > 0 ? {
                "x-actions-taken": "true",
                "x-action-names": mutationNames.join(","),
              } : {}),
            },
          });
        }
      }

      // Safety: max rounds reached
      return new Response(
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Processamento encerrado após múltiplas etapas." } }] })}\n\ndata: [DONE]\n\n`,
        { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } },
      );
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
