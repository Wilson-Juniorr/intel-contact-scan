// LLM-as-judge: valida se a resposta do SDR REALMENTE aplica o cérebro/técnica
// que ela diz aplicar. Roda DEPOIS do crítico determinístico passar.
//
// Saída: { approved, confidence (0-1), reason, evidencia_trecho }
// Em caso de falha de rede / parse, retorna { approved: true, confidence: 0,
// reason: "judge_unavailable" } para NÃO bloquear o fluxo (fail-open).

const CRITIC_MODEL = "google/gemini-2.5-flash-lite";

export interface SemanticVerdict {
  approved: boolean;
  confidence: number;
  reason: string;
  evidencia_trecho: string | null;
}

export async function judgeAnchoring(params: {
  resposta: string;
  cerebro_declarado: string | null;
  cerebro_descricao: string | null;
  tecnica_declarada: string | null;
  tecnica_como_aplicar: string | null;
  ultima_msg_cliente: string;
}): Promise<SemanticVerdict> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { approved: true, confidence: 0, reason: "no_api_key", evidencia_trecho: null };
  }

  // Sem cérebro nem técnica declarados → nada pra julgar
  if (!params.cerebro_declarado && !params.tecnica_declarada) {
    return { approved: true, confidence: 0, reason: "nothing_declared", evidencia_trecho: null };
  }

  const sys = `Você é um auditor crítico de vendas consultivas. Sua única tarefa é avaliar se uma mensagem REALMENTE aplica a técnica/abordagem que diz aplicar — ou se está só citando o nome de fachada.

Você recebe:
1. Mensagem do cliente
2. Resposta do vendedor
3. Cérebro/técnica que o vendedor declarou estar usando
4. Descrição do que essa técnica significa

Você devolve APENAS um JSON com:
{
  "approved": boolean,        // true se a resposta de fato aplica a técnica
  "confidence": 0.0-1.0,      // sua confiança no veredicto
  "reason": "...",            // 1 frase explicando
  "evidencia_trecho": "..."   // trecho da resposta que evidencia OU null se não evidencia
}

Critérios de APROVAÇÃO:
- A mensagem usa o MECANISMO concreto da técnica, não só o tema.
- Ex: "ancoragem de preço" exige citar uma faixa/valor de referência. Citar "tem vários planos" NÃO é ancoragem.
- Ex: "mirroring" exige espelhar palavras do cliente. Repetir genericamente NÃO é mirroring.
- Ex: "prova social" exige citar exemplo concreto de outro cliente/grupo. Falar "muita gente faz" é fraco.

Critérios de REJEIÇÃO:
- A mensagem só cita a técnica de fachada sem aplicar o mecanismo.
- A mensagem aplica uma técnica DIFERENTE da declarada.
- A mensagem é genérica e poderia ter sido escrita sem a técnica.

Seja rigoroso mas justo. confidence < 0.5 = aprova com benefício da dúvida.`;

  const userMsg = `MENSAGEM DO CLIENTE:
"${params.ultima_msg_cliente}"

RESPOSTA DO VENDEDOR:
"${params.resposta}"

CÉREBRO DECLARADO: ${params.cerebro_declarado ?? "(nenhum)"}
${params.cerebro_descricao ? `Descrição do cérebro: ${params.cerebro_descricao}` : ""}

TÉCNICA DECLARADA: ${params.tecnica_declarada ?? "(nenhuma)"}
${params.tecnica_como_aplicar ? `Como esta técnica se aplica: ${params.tecnica_como_aplicar}` : ""}

Avalie e devolva o JSON.`;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CRITIC_MODEL,
        max_tokens: 300,
        temperature: 0.1,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_verdict",
              description: "Reporta o veredicto da auditoria",
              parameters: {
                type: "object",
                properties: {
                  approved: { type: "boolean" },
                  confidence: { type: "number" },
                  reason: { type: "string" },
                  evidencia_trecho: { type: "string" },
                },
                required: ["approved", "confidence", "reason"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_verdict" } },
      }),
    });

    if (!resp.ok) {
      console.warn(`[semantic-critic] gateway ${resp.status} — fail-open`);
      return { approved: true, confidence: 0, reason: `gateway_${resp.status}`, evidencia_trecho: null };
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return { approved: true, confidence: 0, reason: "no_tool_call", evidencia_trecho: null };
    }
    const args = JSON.parse(toolCall.function.arguments);
    return {
      approved: Boolean(args.approved),
      confidence: Number(args.confidence) || 0,
      reason: String(args.reason || ""),
      evidencia_trecho: args.evidencia_trecho ? String(args.evidencia_trecho).slice(0, 500) : null,
    };
  } catch (err) {
    console.warn(`[semantic-critic] error — fail-open:`, err instanceof Error ? err.message : err);
    return { approved: true, confidence: 0, reason: "exception", evidencia_trecho: null };
  }
}