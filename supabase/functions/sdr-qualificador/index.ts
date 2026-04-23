// SDR Pré-Qualificador v5 — Onda Final
// Pipeline: estado da conversa + few-shot dinâmico + LLM Gemini + critic pass
// com anti-monotonia forte + split por `‖` + delays humanizados baseados em
// comprimento/complexidade + METADATA paralelo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AGENT_SLUG = "sdr-qualificador";
const SPLIT_CHAR = "‖";
const CRITIC_MODEL = "google/gemini-2.5-flash-lite";

type Tom =
  | "cooperativo"
  | "resistente"
  | "ocupado"
  | "emocional"
  | "tecnico"
  | "hostil";

interface ConversationState {
  coletado: Record<string, unknown>;
  falta: string[];
  ultima_msg_cliente: string;
  palavras_ultima_msg: number;
  tom_cliente: Tom;
  fonte: string | null;
  turn_number: number;
  veio_por_audio: boolean;
}

function detectarTom(msg: string): Tom {
  const lower = msg.toLowerCase();
  if (/(não enche|chato|para de|já disse|encherem|me deixa em paz)/.test(lower)) return "hostil";
  if (/(urgente|internad|avc|infarto|câncer|cancer|cirurgia|uti)/.test(lower)) return "emocional";
  if (/(pressa|rápido|rapid|tô sem tempo|objetiv|corrid)/.test(lower)) return "ocupado";
  if (/(coparticipa|carência|carencia|cpt|portabil|ans|reajuste)/.test(lower)) return "tecnico";
  if (msg.trim().split(/\s+/).filter(Boolean).length <= 3) return "resistente";
  return "cooperativo";
}

function buildState(
  lead: any,
  conv: any,
  user_message: string,
  is_audio: boolean,
): ConversationState {
  const mem = lead?.lead_memory?.[0]?.structured_json ?? {};
  const coletado: Record<string, unknown> = {};
  if (lead?.name && !/^\+?\d+$/.test(lead.name)) coletado.nome = lead.name;
  if (lead?.type) coletado.tipo = lead.type;
  if (lead?.lives) coletado.vidas = lead.lives;
  if (lead?.operator) coletado.plano_atual = { operadora: lead.operator };
  if (mem.orcamento) coletado.orcamento = mem.orcamento;
  if (mem.rede_hospitais) coletado.rede = mem.rede_hospitais;
  if (mem.urgencia) coletado.urgencia = mem.urgencia;

  const camposBase = ["tipo", "vidas", "plano_atual", "o_que_busca", "regiao", "horario"];
  const falta = camposBase.filter((k) => !(k in coletado));

  const palavras = user_message.trim().split(/\s+/).filter(Boolean).length;
  const turn = ((conv?.mensagens ?? []) as any[]).filter((m) => m.role === "assistant").length + 1;

  return {
    coletado,
    falta,
    ultima_msg_cliente: user_message,
    palavras_ultima_msg: palavras,
    tom_cliente: detectarTom(user_message),
    fonte: null,
    turn_number: turn,
    veio_por_audio: is_audio,
  };
}

async function selectFewShot(
  supabase: any,
  state: ConversationState,
): Promise<string> {
  const { data: exemplos } = await supabase
    .from("agent_examples")
    .select("scenario, turns")
    .eq("agent_slug", AGENT_SLUG)
    .eq("aprovado", true)
    .in("tom_cliente", [state.tom_cliente, "cooperativo"])
    .order("qualidade_score", { ascending: false })
    .limit(3);

  if (!exemplos || exemplos.length === 0) return "";

  let out = "<FEW_SHOT>\n";
  for (const ex of exemplos) {
    out += `\n[Exemplo — cenário "${ex.scenario}"]\n`;
    for (const t of (ex.turns as any[])) {
      out += `${t.role === "user" ? "User" : "Assistant"}: ${t.content}\n`;
    }
  }
  out += "</FEW_SHOT>\n\nUse esses exemplos como PADRÃO de qualidade.\n";
  return out;
}

async function buildBrainsBlock(supabase: any): Promise<string> {
  const { data } = await supabase
    .from("agent_vendor_profiles")
    .select("peso, notas, vendor_profiles(nome, origem, tom, estilo, principios, quando_usar, evitar_quando, exemplos_frases)")
    .eq("agent_slug", AGENT_SLUG)
    .order("peso", { ascending: false });
  if (!data || data.length === 0) return "";
  let out = "\n## 🧠 CÉREBROS QUE TE FORMAM (combine o melhor de cada um — ordenado por peso)\n";
  for (const row of data) {
    const v = (row as any).vendor_profiles;
    if (!v) continue;
    out += `\n### ${v.nome}${v.origem ? ` (${v.origem})` : ""} — peso ${row.peso}/10\n`;
    if (v.tom) out += `- Tom: ${v.tom}\n`;
    if (v.estilo) out += `- Estilo: ${v.estilo}\n`;
    if (v.principios) out += `- Princípios: ${v.principios}\n`;
    if (v.quando_usar) out += `- Quando usar: ${v.quando_usar}\n`;
    if (v.evitar_quando) out += `- Evitar quando: ${v.evitar_quando}\n`;
    const frases = Array.isArray(v.exemplos_frases) ? v.exemplos_frases : [];
    if (frases.length) {
      out += `- Frases-modelo:\n`;
      for (const f of frases.slice(0, 3)) out += `  • "${f}"\n`;
    }
  }
  return out;
}

async function buildTechniquesBlock(supabase: any): Promise<string> {
  const { data } = await supabase
    .from("agent_techniques")
    .select("prioridade, notas, sales_techniques(nome, categoria, descricao, como_aplicar, gatilho_uso, exemplos)")
    .eq("agent_slug", AGENT_SLUG)
    .order("prioridade", { ascending: false });
  if (!data || data.length === 0) return "";
  let out = "\n## 🎯 TÉCNICAS QUE VOCÊ DOMINA (use a apropriada ao momento)\n";
  for (const row of data) {
    const t = (row as any).sales_techniques;
    if (!t) continue;
    out += `\n### ${t.nome} — prioridade ${row.prioridade}/10 (${t.categoria})\n`;
    if (t.descricao) out += `${t.descricao}\n`;
    out += `Como aplicar: ${t.como_aplicar}\n`;
    if (t.gatilho_uso) out += `Use quando: ${t.gatilho_uso}\n`;
    const exs = Array.isArray(t.exemplos) ? t.exemplos : [];
    if (exs.length) {
      const ex = exs[0];
      if (ex?.cliente && ex?.agente) out += `Exemplo: Cliente: "${ex.cliente}" → Você: "${ex.agente}"\n`;
    }
  }
  return out;
}

function parseResponse(raw: string): { texto: string; meta: any | null } {
  const m = raw.match(/<METADATA>([\s\S]*?)<\/METADATA>/);
  if (!m) return { texto: raw.trim(), meta: null };
  let meta: any = null;
  try { meta = JSON.parse(m[1].trim()); } catch { meta = { parse_error: true }; }
  const texto = raw.replace(/<METADATA>[\s\S]*?<\/METADATA>/, "").trim();
  return { texto, meta };
}

async function callGemini(
  modelo: string,
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  opts: { max_tokens: number; temperature: number },
): Promise<{ text: string; tokens_in: number; tokens_out: number }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      max_tokens: opts.max_tokens,
      temperature: opts.temperature,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`AI gateway ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    tokens_in: data.usage?.prompt_tokens ?? 0,
    tokens_out: data.usage?.completion_tokens ?? 0,
  };
}

// Calcula delay humanizado por balão + "thinking time" no primeiro
// Fórmula inspirada em humano digitando no celular:
//   - thinking (ler mensagem + pensar) = 1.8-3.5s só no 1º balão
//   - typing = 90-140ms por caractere (humano médio celular)
//   - send pause (tocar enviar) = 200-600ms
//   - jitter natural = ±25%
//   - hard min 2500ms, hard max 15000ms
function calcularDelay(balao: string, isPrimeiroBalao: boolean, complexidadeMsg: number): number {
  const thinking = isPrimeiroBalao
    ? 1800 + Math.min(complexidadeMsg * 80, 1700) + Math.random() * 600
    : 500 + Math.random() * 800;
  const perChar = 90 + Math.random() * 50;
  const typing = balao.length * perChar;
  const sendPause = 200 + Math.random() * 400;
  const raw = thinking + typing + sendPause;
  const jitter = (Math.random() * 0.5 - 0.25) * raw;
  const total = raw + jitter;
  return Math.round(Math.min(Math.max(total, 2500), 15000));
}

function runDeterministicCritic(
  texto: string,
  meta: any,
  state: ConversationState,
  ultimosBaloes: number[] = [],
): string[] {
  const fails: string[] = [];
  if (!texto || texto.length < 3) fails.push("resposta_vazia");
  if (texto.length > 1200) fails.push("resposta_longa_demais");

  const baloes = texto.split(SPLIT_CHAR).map((b) => b.trim()).filter(Boolean);
  const palavrasTotal = texto.replace(/‖/g, " ").split(/\s+/).filter(Boolean).length;
  if (palavrasTotal > 12 && baloes.length === 1) fails.push("falta_split_baloes");

  // Limites duros de quantidade
  if (baloes.length > 4) fails.push("baloes_acima_do_maximo_4");
  // Cliente respondeu curto → resposta deve ser curta (1-2 balões no máximo)
  if (state.palavras_ultima_msg <= 5 && baloes.length > 2) {
    fails.push("excesso_baloes_para_msg_curta_do_cliente");
  }
  // Resposta curta total não pode ser fragmentada em 3+
  if (palavrasTotal <= 18 && baloes.length >= 3) {
    fails.push("fragmentacao_excessiva_para_resposta_curta");
  }
  // Anti-monotonia FORTE: obriga variação turn-a-turn
  if (ultimosBaloes.length >= 1) {
    if (ultimosBaloes[ultimosBaloes.length - 1] === 3 && baloes.length === 3) {
      fails.push("padrao_3_baloes_repetido");
    }
    if (ultimosBaloes[ultimosBaloes.length - 1] === 4 && baloes.length === 4) {
      fails.push("padrao_4_baloes_repetido");
    }
    if (ultimosBaloes.length >= 2 &&
        ultimosBaloes[ultimosBaloes.length - 1] === ultimosBaloes[ultimosBaloes.length - 2] &&
        baloes.length === ultimosBaloes[ultimosBaloes.length - 1]) {
      fails.push(`padrao_${baloes.length}_baloes_repetido_3_vezes`);
    }
  }
  if (state.palavras_ultima_msg <= 8 && baloes.length > 2) {
    fails.push("excesso_baloes_para_msg_curta_do_cliente");
  }
  if (state.tom_cliente === "emocional" && baloes.length > 2) {
    fails.push("excesso_baloes_em_contexto_emocional");
  }

  for (const b of baloes) {
    const linhas = b.split("\n").filter((l) => l.trim()).length;
    if (linhas > 4) fails.push("balao_com_mais_de_3_linhas");
  }

  const lower = texto.toLowerCase();
  const blocklist = [
    // Robotismo / corporativês
    "em que posso ajudá", "estou à disposição", "prezado", "caro cliente",
    "obrigado por entrar em contato", "nosso atendimento", "maravilhoso!",
    // Compliance ANS
    "garantid", "imperdível", "só hoje", "100%", "melhor plano",
    // Anti-infantilização
    "mastigadinho", "mastigado pro", "mastigado pra", "bonitinho pro", "bonitinho pra",
    // Revelar que é bot
    "como assistente", "sou uma ia", "sou um bot", "sou robô", "sou uma inteligência",
    // Áudio — nunca mencionar transcrição
    "recebi seu áudio", "recebi seu audio", "ouvi seu áudio", "ouvi seu audio",
    "entendi seu áudio", "entendi seu audio", "escutei seu áudio", "escutei seu audio",
    "seu áudio chegou", "seu audio chegou", "transcrição", "transcricao",
    // Frases que quebram o papel de SDR
    "sou o corretor", "eu mesmo cotando", "eu faço a cotação", "te mando a proposta",
  ];
  for (const p of blocklist) if (lower.includes(p)) fails.push(`blocklist:${p}`);

  for (const b of baloes) {
    const emojis = [...b.matchAll(/[\u{1F300}-\u{1FAFF}]/gu)];
    if (emojis.length > 2) fails.push("multiplos_emojis_em_balao");
    const proibidos = ["🎯", "💯", "🚀", "⚡", "🔥", "✅", "❌"];
    for (const e of emojis) if (proibidos.includes(e[0])) fails.push(`emoji_proibido:${e[0]}`);
  }

  if (state.palavras_ultima_msg <= 5 && meta && meta.usou_mirror_ou_label === false) {
    fails.push("nao_aplicou_mirror_em_resposta_curta");
  }
  return fails;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const { lead_id, whatsapp_number, user_message, is_audio } = body;
    let conversation_id: string | null = body.conversation_id ?? null;

    if (!lead_id || !whatsapp_number || !user_message) {
      return new Response(
        JSON.stringify({ ok: false, error: "lead_id, whatsapp_number e user_message são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Agent config
    const { data: agent } = await supabase.from("agents_config")
      .select("*").eq("slug", AGENT_SLUG).eq("ativo", true).maybeSingle();
    if (!agent) throw new Error(`Agent ${AGENT_SLUG} inativo ou não encontrado`);

    // Acha/cria conversation
    if (!conversation_id) {
      const { data: existing } = await supabase
        .from("agent_conversations")
        .select("id")
        .eq("lead_id", lead_id).eq("agent_slug", AGENT_SLUG)
        .in("status", ["ativa", "digitando", "pausada"])
        .order("ultima_atividade", { ascending: false })
        .limit(1).maybeSingle();
      if (existing) {
        conversation_id = existing.id;
      } else {
        const { data: novo, error: convErr } = await supabase
          .from("agent_conversations")
          .insert({ lead_id, agent_slug: AGENT_SLUG, whatsapp_number, status: "ativa", mensagens: [] })
          .select("id").single();
        if (convErr) throw convErr;
        conversation_id = novo!.id;
      }
    }

    await supabase.from("agent_conversations")
      .update({ status: "digitando", ultima_atividade: new Date().toISOString() })
      .eq("id", conversation_id);

    const [{ data: conv }, { data: lead }] = await Promise.all([
      supabase.from("agent_conversations").select("*").eq("id", conversation_id).maybeSingle(),
      supabase.from("leads").select("*, lead_memory(*)").eq("id", lead_id).maybeSingle(),
    ]);

    const state = buildState(lead, conv, user_message, is_audio === true);
    const [fewShot, brainsBlock, techniquesBlock] = await Promise.all([
      selectFewShot(supabase, state),
      buildBrainsBlock(supabase),
      buildTechniquesBlock(supabase),
    ]);

    const historico = (conv?.mensagens ?? []) as Array<{ role: string; content: string }>;

    const systemWithContext = (agent.system_prompt as string) +
      brainsBlock +
      techniquesBlock +
      "\n\n═══ ESTADO ATUAL DA CONVERSA ═══\n" +
      `COLETADO: ${JSON.stringify(state.coletado)}\n` +
      `FALTA: ${JSON.stringify(state.falta)}\n` +
      `ULTIMA_MSG_CLIENTE: "${state.ultima_msg_cliente}"\n` +
      `PALAVRAS_ULTIMA_MSG: ${state.palavras_ultima_msg}\n` +
      `TOM_CLIENTE: ${state.tom_cliente}\n` +
      `TURN: ${state.turn_number}\n` +
      (state.veio_por_audio
        ? "\n🎤 ESTA MENSAGEM CHEGOU COMO ÁUDIO. O texto acima é a TRANSCRIÇÃO do áudio do cliente.\n" +
          "REGRAS PARA RESPONDER ÁUDIO:\n" +
          "- NÃO diga 'recebi seu áudio', 'ouvi seu áudio', 'entendi seu áudio'.\n" +
          "- NÃO repita a transcrição literal nem cite que é uma transcrição.\n" +
          "- Responda como se estivesse numa conversa fluida — exatamente como você responderia a um texto.\n" +
          "- Se a transcrição estiver confusa/incompleta, peça pra repetir de forma natural ('não peguei tudo, me conta de novo?').\n" +
          "- Mantenha o split em balões e o tom humano de sempre.\n"
        : "") +
      (state.palavras_ultima_msg <= 5
        ? "\n⚠️ CLIENTE RESPONDEU CURTO — SUA PRÓXIMA MENSAGEM DEVE USAR MIRRORING OU LABELING.\n"
        : "") +
      `\n${fewShot}\n`;

    const messages = [...historico, { role: "user", content: user_message }];

    // Histórico de quantidade de balões dos últimos turnos do agente (anti-monotonia)
    const ultimosBaloes: number[] = (historico as any[])
      .filter((m) => m.role === "assistant" && typeof m.content === "string")
      .slice(-3)
      .map((m) => {
        const n = m.content.split(SPLIT_CHAR).map((b: string) => b.trim()).filter(Boolean).length;
        return Math.max(1, n);
      });

    // Generate + critic loop (max 2 attempts)
    let propostaFinal: string | null = null;
    let metadata: any = null;
    let criterios_falhados: string[] = [];
    let attempt = 0;
    let totalIn = 0;
    let totalOut = 0;

    while (attempt < 2 && !propostaFinal) {
      attempt++;
      const resp = await callGemini(agent.modelo, systemWithContext, messages, {
        max_tokens: agent.max_tokens,
        temperature: Number(agent.temperature),
      });
      totalIn += resp.tokens_in;
      totalOut += resp.tokens_out;

      const { texto, meta } = parseResponse(resp.text);
      const fails = runDeterministicCritic(texto, meta, state, ultimosBaloes);

      if (fails.length === 0) {
        propostaFinal = texto;
        metadata = meta;
        criterios_falhados = [];
      } else {
        criterios_falhados = fails;
        if (attempt >= 2) {
          // Aceita mesmo com falhas em vez de cair em fallback
          propostaFinal = texto || "Pode me dar um segundinho?";
          metadata = meta;
        } else {
          messages.push({
            role: "user",
            content: `[SISTEMA] Sua resposta anterior falhou: ${fails.join(", ")}. Regenere corrigindo.`,
          });
        }
      }
    }

    if (!propostaFinal) propostaFinal = "Oi! Dá um segundinho que já te respondo certinho 😅";

    // Logs
    await supabase.from("agent_critic_log").insert({
      conversation_id,
      resposta_proposta: propostaFinal,
      criterios_falhados,
      regenerou: attempt > 1,
      resposta_final: propostaFinal,
    });

    // Split em balões
    const baloes = propostaFinal.split(SPLIT_CHAR).map((b) => b.trim()).filter(Boolean);
    const delays = baloes.map((b) => calcularDelay(b));

    await supabase.from("agent_split_log").insert({
      conversation_id,
      resposta_original: propostaFinal,
      numero_baloes: baloes.length,
      delays_ms: delays,
    });

    // Persiste mensagens
    const novosMensagens = [...messages.filter((m) => !m.content?.startsWith("[SISTEMA]")), { role: "assistant", content: propostaFinal }];
    await supabase.from("agent_conversations").update({
      mensagens: novosMensagens,
      conversation_state: state,
      balao_count: (conv?.balao_count ?? 0) + baloes.length,
      critic_fails: (conv?.critic_fails ?? 0) + (criterios_falhados.length > 0 ? 1 : 0),
      total_tokens_in: (conv?.total_tokens_in ?? 0) + totalIn,
      total_tokens_out: (conv?.total_tokens_out ?? 0) + totalOut,
      status: "ativa",
      ultima_atividade: new Date().toISOString(),
    }).eq("id", conversation_id);

    await supabase.from("agent_messages").insert([
      { conversation_id, direcao: "incoming", conteudo: user_message, tokens_in: totalIn },
      { conversation_id, direcao: "outgoing", conteudo: propostaFinal, tokens_out: totalOut },
    ]);

    const qualificou = !!metadata?.deve_transferir_junior;

    return new Response(
      JSON.stringify({
        ok: true,
        conversation_id,
        // Novos campos (v3)
        baloes,
        delay_per_balao: delays,
        metadata,
        criterios_falhados,
        // Retrocompat com Playground atual
        mensagens: baloes,
        delays_ms: delays,
        qualificou,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sdr-qualificador v3 error:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});