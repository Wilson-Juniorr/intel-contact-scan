// SDR Pré-Qualificador v5 — Onda Final
// Pipeline: estado da conversa + few-shot dinâmico + LLM Gemini + critic pass
// com anti-monotonia forte + split por `‖` + delays humanizados baseados em
// comprimento/complexidade + METADATA paralelo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderPersonaInPrompt } from "./persona.ts";
import { judgeAnchoring } from "./semantic-critic.ts";
import { detectCampaign, type CampaignTrigger, type CampaignDetection } from "./campaigns.ts";
import {
  classifySignal,
  pruneBrains,
  pruneTechniques,
  type BrainRow,
  type TechniqueRow,
} from "./brain-pruning.ts";
import {
  evaluateQualification,
  qualProgressBlock,
  REQUIRED_FIELDS,
  type QualProgress,
} from "./qual-score.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Slug canônico do agente principal de pré-qualificação.
// Edge function canônica do agente principal de pré-qualificação.
// Slug em DB: `junior-sdr`. A função `sdr-qualificador` permanece como
// shim de compatibilidade encaminhando para esta.
const AGENT_SLUG = "junior-sdr";
const SPLIT_CHAR = "‖";
const CRITIC_MODEL = "google/gemini-2.5-flash-lite";

// ═══ Detecção de "lead NOVO vindo de anúncio / interesse explícito em cotação" ═══
// Frases típicas que pessoas mandam quando clicam num anúncio de plano de saúde
// no Instagram/Facebook/Google ou são abordadas por uma landing page.
// Match é case-insensitive, sem acentos, e olha trechos (não exige frase exata).
const ANUNCIO_PATTERNS: RegExp[] = [
  // Pedido direto de simulação/cotação/orçamento
  /\bsimula(c|ç)ao\b/i,
  /\bsimular\b/i,
  /\bcota(c|ç)ao\b/i,
  /\bcotar\b/i,
  /\borca(m|n)ento\b/i,
  /\bor(c|ç)ar\b/i,
  /\bvalor(es)?\b.*\bplano/i,
  /\bpre(c|ç)o\b.*\bplano/i,
  /\bquanto custa\b/i,
  /\bquanto fica\b/i,
  /\bquanto sai\b/i,
  // Interesse direto em plano/convênio/seguro
  /\bquero (um |uma )?(plano|conv(e|ê)nio|seguro)/i,
  /\bprecis(o|amos|ando) (de )?(um |uma )?(plano|conv(e|ê)nio|seguro)/i,
  /\bgostaria de (saber|contratar|ter) (um |uma )?(plano|conv(e|ê)nio|seguro)/i,
  /\binteresse (em|no|num) (plano|conv(e|ê)nio|seguro)/i,
  /\bme interess(ei|a) (pelo|por um|pelo plano|pelo seguro|pelo conv(e|ê)nio)/i,
  // Vindo de anúncio explicitamente
  /\bvi (o |um |seu )?an(u|ú)ncio\b/i,
  /\bdo an(u|ú)ncio\b/i,
  /\bvi no (insta|instagram|facebook|face|google|tiktok|youtube)/i,
  /\bachei (no |pelo )?(google|insta|instagram|facebook)/i,
  /\bcliquei (no |num )?an(u|ú)ncio\b/i,
  // Saúde/empresa específicos
  /\bplano (de )?sa(u|ú)de\b/i,
  /\bplano empresarial\b/i,
  /\bplano pme\b/i,
  /\bplano (pra|para) (mim|minha (familia|família|empresa)|meus (filhos|pais))/i,
  // Pedido pra ser contatado / falar com corretor
  /\bme manda (os )?valor/i,
  /\bme passa (os )?valor/i,
  /\bquero contratar\b/i,
  /\bcomo fa(c|ç)o (pra|para) (contratar|adquirir|fechar)/i,
];

function isAnuncioMessage(msg: string): { match: boolean; pattern?: string } {
  if (!msg || typeof msg !== "string") return { match: false };
  const norm = msg
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  for (const re of ANUNCIO_PATTERNS) {
    if (re.test(msg) || re.test(norm)) {
      return { match: true, pattern: re.source };
    }
  }
  return { match: false };
}

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
  source_type: "audio" | "text" | "image" | "document" | "unknown";
  transcription_confidence: number | null;
  transcription_quality: "good" | "low" | "none";
  contexto_cliente: {
    estagio: string | null;
    ja_e_cliente: boolean;
    assumido_corretor: boolean;
    operadora_atual: string | null;
    cotacao_enviada: boolean;
    memoria_resumo: string | null;
    historico_estruturado: Record<string, unknown>;
    ultima_atividade_dias: number | null;
  };
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
  source_type: ConversationState["source_type"] = "text",
  transcription_confidence: number | null = null,
): ConversationState {
  const mem = lead?.lead_memory?.[0]?.structured_json ?? {};
  const memSummary: string | null = lead?.lead_memory?.[0]?.summary ?? null;
  const coletado: Record<string, unknown> = {};
  if (lead?.name && !/^\+?\d+$/.test(lead.name)) coletado.nome = lead.name;
  if (lead?.type) coletado.tipo = lead.type;
  if (lead?.lives) coletado.vidas = lead.lives;
  if (lead?.operator) coletado.plano_atual = { operadora: lead.operator };
  if (mem.orcamento) coletado.orcamento = mem.orcamento;
  if (mem.rede_hospitais) coletado.rede = mem.rede_hospitais;
  if (mem.urgencia) coletado.urgencia = mem.urgencia;
  // Campos aprendidos pelo SDR em turnos anteriores (via syncLeadDataFromMetadata)
  if (mem.regiao) coletado.regiao = mem.regiao;
  if (mem.o_que_busca) coletado.o_que_busca = mem.o_que_busca;
  if (mem.horario) coletado.horario = mem.horario;
  if (mem.faixa_etaria) coletado.faixa_etaria = mem.faixa_etaria;
  if (mem.objetivo) coletado.objetivo = mem.objetivo;
  // plano_atual estruturado quando memória já trouxe
  if (mem.plano_atual && !coletado.plano_atual) coletado.plano_atual = mem.plano_atual;
  // Permite que memória sobreescreva defaults de lead.type e lead.lives
  // caso o lead tenha sido criado com tipo "PF" default mas cliente esclareceu que é PJ
  if (mem.tipo && !coletado.tipo) coletado.tipo = mem.tipo;
  if (mem.vidas && !coletado.vidas) coletado.vidas = mem.vidas;

  // `falta` é só compat com prompt legado — quem manda agora é qual-score.evaluateQualification.
  const falta = (REQUIRED_FIELDS as readonly string[]).filter((k) => !(k in coletado));

  const palavras = user_message.trim().split(/\s+/).filter(Boolean).length;
  const turn = ((conv?.mensagens ?? []) as any[]).filter((m) => m.role === "assistant").length + 1;

  // Detecta se já é cliente: tem operadora cadastrada OU summary menciona "já é cliente"/"cliente nosso"/"convênio ativo"
  const summaryLower = (memSummary ?? "").toLowerCase();
  const ja_e_cliente = Boolean(
    lead?.operator ||
    /j[aá] (é|e) cliente|cliente nosso|conv[êe]nio ativo|tem plano (ativo|conosco)|aplicativo do conv[êe]nio|2[ªa] via|segunda via|boleto do conv[êe]nio|carteirinha/.test(summaryLower)
  );

  const ultimaAt = lead?.updated_at || lead?.last_contact_at;
  const ultimaAtividadeDias = ultimaAt
    ? Math.floor((Date.now() - new Date(ultimaAt).getTime()) / 86400000)
    : null;

  // Qualidade da transcrição (somente para áudio)
  let transcription_quality: ConversationState["transcription_quality"] = "good";
  if (is_audio) {
    const txt = (user_message || "").trim();
    const inaudible =
      !txt ||
      txt === "[Áudio não compreendido]" ||
      /\[áudio não compreendido\]/i.test(txt);
    if (inaudible) {
      transcription_quality = "none";
    } else if (transcription_confidence !== null && transcription_confidence < 0.4) {
      transcription_quality = "low";
    } else if (transcription_confidence === null && txt.split(/\s+/).filter(Boolean).length < 2) {
      transcription_quality = "low";
    }
  }

  return {
    coletado,
    falta,
    ultima_msg_cliente: user_message,
    palavras_ultima_msg: palavras,
    tom_cliente: detectarTom(user_message),
    fonte: null,
    turn_number: turn,
    veio_por_audio: is_audio,
    source_type,
    transcription_confidence,
    transcription_quality,
    contexto_cliente: {
      estagio: lead?.stage ?? null,
      ja_e_cliente,
      assumido_corretor: Boolean(lead?.assumed_at) || lead?.in_manual_conversation === true,
      operadora_atual: lead?.operator ?? null,
      cotacao_enviada: Boolean(lead?.last_quote_sent_at) || lead?.stage === "cotacao_enviada",
      memoria_resumo: memSummary,
      historico_estruturado: mem,
      ultima_atividade_dias: ultimaAtividadeDias,
    },
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

async function fetchAllBrains(supabase: any): Promise<BrainRow[]> {
  const { data } = await supabase
    .from("agent_vendor_profiles")
    .select("id, peso, notas, vendor_profiles(id, nome, origem, tom, estilo, principios, quando_usar, evitar_quando, exemplos_frases)")
    .eq("agent_slug", AGENT_SLUG)
    .order("peso", { ascending: false });
  return (data ?? []) as BrainRow[];
}

function buildBrainsBlockFromRows(rows: BrainRow[]): string {
  if (!rows.length) return "";
  let out = "\n## 🧠 CÉREBROS QUE TE FORMAM (use UM como liderança neste turno — escolhidos pelo contexto)\n";
  for (const row of rows) {
    const v = row.vendor_profiles;
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
  // Roteiro de alternância quando os 2 cérebros oficiais do SDR estão ativos
  const slugs = rows.map((r) => r.vendor_profiles?.nome?.toLowerCase() ?? "");
  const hasVoss = slugs.some((s) => s.includes("voss"));
  const hasHormozi = slugs.some((s) => s.includes("hormozi"));
  if (hasVoss && hasHormozi) {
    out += `
## 🎭 ROTEIRO DE ALTERNÂNCIA — Voss × Hormozi
Você combina DUAS mentes com papéis claros. Não use as duas no mesmo balão — alterne conforme o momento:
- **Chris Voss lidera quando:** abertura da conversa, lead resistente/desconfiado, lead emocional ou ansioso, surge objeção, cliente solta uma queixa. Use labeling ("parece que..."), mirroring (ecoa as 1-3 últimas palavras como pergunta) e calibrated questions (Como? O quê?). Tom Late Night FM DJ — calmo, pausado, acolhedor.
- **Alex Hormozi lidera quando:** o lead já está engajado e você precisa qualificar (PF/PJ, vidas, plano atual, urgência, hospital de preferência). Uma pergunta cirúrgica por vez, sem enrolação, sem prescrever antes de diagnosticar. Tom direto e respeitoso.
- Regra de ouro: **diagnóstico antes de prescrição**. Nunca proponha plano/cotação antes de entender o problema real.
- No campo \`metadata.cerebro_lider\` da resposta, declare honestamente "Chris Voss" ou "Alex Hormozi" — o crítico semântico audita.
`;
  }
  return out;
}

async function fetchAllTechniques(supabase: any): Promise<TechniqueRow[]> {
  const { data } = await supabase
    .from("agent_techniques")
    .select("prioridade, notas, sales_techniques(id, nome, categoria, descricao, como_aplicar, gatilho_uso, exemplos)")
    .eq("agent_slug", AGENT_SLUG)
    .order("prioridade", { ascending: false });
  return (data ?? []) as TechniqueRow[];
}

function buildTechniquesBlockFromRows(rows: TechniqueRow[]): string {
  if (!rows.length) return "";
  let out = "\n## 🎯 TÉCNICAS QUE VOCÊ DOMINA (escolha UMA pra ESTE turno — escolhidas pelo contexto)\n";
  for (const row of rows) {
    const t = row.sales_techniques;
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
  // Tenta formato <METADATA>...</METADATA> primeiro
  const tagMatch = raw.match(/<METADATA>([\s\S]*?)<\/METADATA>/);
  if (tagMatch) {
    let meta: any = null;
    try { meta = JSON.parse(tagMatch[1].trim()); } catch { meta = { parse_error: true }; }
    const texto = raw.replace(/<METADATA>[\s\S]*?<\/METADATA>/, "").trim();
    return { texto, meta };
  }

  // Tenta JSON direto no final (com ou sem backticks ```json...```)
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "");
  const jsonMatch = cleaned.match(/\n(\{[\s\S]*"raciocinio"[\s\S]*\})\s*$/);
  if (jsonMatch) {
    let meta: any = null;
    try { meta = JSON.parse(jsonMatch[1].trim()); } catch { meta = { parse_error: true }; }
    const texto = cleaned.replace(/\n?\{[\s\S]*"raciocinio"[\s\S]*\}\s*$/, "").trim();
    return { texto, meta };
  }

  // Fallback: tenta qualquer JSON com "coletado" no final
  const fallbackMatch = cleaned.match(/\n(\{[\s\S]*"coletado"[\s\S]*\})\s*$/);
  if (fallbackMatch) {
    let meta: any = null;
    try { meta = JSON.parse(fallbackMatch[1].trim()); } catch { meta = { parse_error: true }; }
    const texto = cleaned.replace(/\n?\{[\s\S]*"coletado"[\s\S]*\}\s*$/, "").trim();
    return { texto, meta };
  }

  return { texto: raw.trim(), meta: null };
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
  // Soft preference apenas — não falha, vai auto-dividir antes de enviar.
  // (Manter agente travando por isso bloqueia respostas inteiras.)

  // Limites duros de quantidade
  if (baloes.length > 4) fails.push("baloes_acima_do_maximo_4");
  // Cliente respondeu MUITO curto (1-3 palavras) → resposta de 3+ balões é exagero
  if (state.palavras_ultima_msg <= 3 && baloes.length > 2) {
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
  // Preferência por 1-2 balões quando cliente foi breve
  if (state.palavras_ultima_msg <= 8 && baloes.length > 2) {
    fails.push("excesso_baloes_para_msg_curta_do_cliente");
  }
  // Preferência forte por balão único em contexto emocional
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

  // Mirror/label só é exigido a partir do 2º turno e em respostas MUITO curtas (<=3 palavras).
  // Saudações de abertura como "Olá gostaria de mais informações" não devem bloquear a resposta.
  if (
    state.turn_number >= 2 &&
    state.palavras_ultima_msg <= 3 &&
    meta &&
    meta.usou_mirror_ou_label === false
  ) {
    fails.push("nao_aplicou_mirror_em_resposta_curta");
  }

  // Força meta-raciocínio: agente DEVE declarar cérebro + técnica usados.
  // Só checa a partir do turno 2 (turno 1 ainda pode ser saudação genérica).
  if (state.turn_number >= 2 && meta) {
    if (!meta.cerebro_principal || typeof meta.cerebro_principal !== "string" || meta.cerebro_principal.length < 2) {
      fails.push("nao_declarou_cerebro_principal");
    }
    if (!meta.tecnica_aplicada || typeof meta.tecnica_aplicada !== "string" || meta.tecnica_aplicada.length < 2) {
      fails.push("nao_declarou_tecnica_aplicada");
    }
  }

  // Se há resumo de cliente conhecido, agente NÃO pode tratar como lead novo
  if (state.contexto_cliente?.memoria_resumo) {
    const tl = texto.toLowerCase();
    const padroesNovo = [
      "como posso te ajudar hoje", "em que posso ajudar", "qual seu nome",
      "qual o seu nome", "primeira vez", "vi seu interesse",
      "vi que você se interessou", "tudo bem com você",
    ];
    for (const p of padroesNovo) {
      if (tl.includes(p)) { fails.push("tratou_cliente_conhecido_como_novo"); break; }
    }
  }

  return fails;
}

// Escreve de volta no banco o que o SDR aprendeu neste turno.
// Isso garante que buildState() no próximo turno veja o COLETADO correto.
async function syncLeadDataFromMetadata(
  supabase: any,
  lead: any,
  lead_id: string,
  metadata: any,
): Promise<void> {
  const coletadoMeta = metadata?.coletado ?? {};
  if (!coletadoMeta || Object.keys(coletadoMeta).length === 0) return;

  // 1. Atualiza campos estruturados da tabela leads
  const leadUpdates: Record<string, any> = {};

  const tipoRaw = String(coletadoMeta.tipo ?? "").toUpperCase();
  if (tipoRaw === "PF") leadUpdates.type = "PF";
  else if (tipoRaw === "PJ" || tipoRaw.includes("PME") || tipoRaw.includes("EMPRESA")) {
    leadUpdates.type = "PJ";
  }

  const vidasNum = Number(coletadoMeta.vidas);
  if (!isNaN(vidasNum) && vidasNum > 0 && vidasNum <= 999) {
    leadUpdates.lives = vidasNum;
  }

  const operadoraStr = coletadoMeta.plano_atual?.operadora;
  if (operadoraStr && typeof operadoraStr === "string" && operadoraStr.trim()) {
    leadUpdates.operator = operadoraStr.trim().toLowerCase();
  }

  if (Object.keys(leadUpdates).length > 0) {
    await supabase.from("leads")
      .update({ ...leadUpdates, updated_at: new Date().toISOString() })
      .eq("id", lead_id);
  }

  // 2. Atualiza lead_memory.structured_json com campos "suaves"
  const existingJson: Record<string, any> =
    lead?.lead_memory?.[0]?.structured_json ?? {};
  const merged: Record<string, any> = { ...existingJson };

  const softFields: Array<[string, unknown]> = [
    ["regiao", coletadoMeta.regiao],
    ["o_que_busca", coletadoMeta.o_que_busca],
    ["horario", coletadoMeta.horario],
    ["orcamento", coletadoMeta.orcamento],
    ["urgencia", coletadoMeta.urgencia],
    ["rede_hospitais", coletadoMeta.rede],
    ["tipo", coletadoMeta.tipo],
    ["vidas", coletadoMeta.vidas],
    ["faixa_etaria", coletadoMeta.faixa_etaria],
    ["objetivo", coletadoMeta.objetivo],
    ["plano_atual", coletadoMeta.plano_atual],
    ["cnpj", coletadoMeta.cnpj],
  ];

  let memChanged = false;
  for (const [key, val] of softFields) {
    if (val !== undefined && val !== null && val !== "") {
      merged[key] = val;
      memChanged = true;
    }
  }

  if (memChanged && lead?.user_id) {
    await supabase.from("lead_memory").upsert(
      {
        lead_id,
        user_id: lead.user_id,
        structured_json: merged,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lead_id,user_id" },
    );
  }
}

// ═══ FALLBACK SYSTEM PROMPT ═══
// Usado quando agents_config.system_prompt está vazio ou muito curto.
// Garante que o Junior funciona mesmo sem configuração manual no Builder.
function generateFallbackSystemPrompt(): string {
  return `# JUNIOR — PRÉ-QUALIFICADOR DE PLANOS DE SAÚDE

Você é **Junior**, consultor de planos de saúde com anos de experiência. Você conversa com leads pelo WhatsApp.
O lead NÃO sabe que está falando com IA — ele acha que está falando com o Junior humano.
Você é um VENDEDOR NATO: confiante, empático, direto, consultivo. Nunca robótico. Nunca questionário.

## ARQUITETURA DE RACIOCÍNIO (Chain-of-Thought interno)

ANTES de escrever qualquer mensagem, PENSE internamente (não mostre ao lead):
1. CONTEXTO: O que esse lead quer? Qual a situação dele? O que já sei?
2. PERFIL: É empresário? Mãe? Jovem? Idoso? Como adaptar minha linguagem?
3. EMOÇÃO: Tá com pressa? Preocupado? Curioso? Desconfiado?
4. ESTRATÉGIA: Qual técnica usar agora? Mirroring? Ancoragem? Empatia?
5. PRÓXIMO PASSO: Qual dado coletar? Como perguntar de forma natural?

Esse raciocínio vai no campo "raciocinio" do METADATA. A mensagem pro lead é só o resultado final — curta, natural, humana.

## ADAPTAÇÃO AO PERFIL DO LEAD

Adapte seu frame baseado no que já sabe:

SE lead é EMPRESÁRIO/PJ:
- Fale de ROI, produtividade, retenção de talentos
- "Plano de saúde é o benefício #1 que segura funcionário bom"
- Tom mais executivo, direto, sem enrolação
- Mencione: dedução fiscal, menos absenteísmo

SE lead é MÃE/FAMÍLIA (PF com dependentes):
- Fale de segurança, cobertura pediátrica, maternidade
- "Com criança a gente não pode ficar sem plano, né?"
- Tom mais acolhedor, compreensivo
- Mencione: pediatra, pronto-socorro, vacinas

SE lead é JOVEM (PF individual):
- Fale de praticidade, telemedicina, academia
- "Plano hoje é investimento em prevenção"
- Tom mais descontraído
- Mencione: app, teleconsulta, sem burocracia

SE lead quer TROCAR de operadora:
- Valide a frustração ("reajuste tá absurdo mesmo")
- Fale de portabilidade sem carência
- "Consigo manter sua carência e melhorar o plano"
- Foque em: economia + melhoria

SE lead quer REDUZIR CUSTO:
- Não julgue, valide
- Mostre opções com coparticipação
- "Tem formas de reduzir 30-40% sem perder cobertura"
- Foque em: custo-benefício

SE não sabe o perfil ainda:
- Use perguntas abertas pra descobrir
- "Me conta mais da sua situação"

## TÉCNICAS DE VENDAS (usar naturalmente)

CHRIS VOSS (Never Split the Difference):
- Mirroring: repita as últimas 2-3 palavras como pergunta ("empresa de tecnologia?")
- Labeling: "Parece que o valor tá pesando..." / "Sinto que é urgente..."
- Calibrated questions: "O que seria ideal pra você?" / "Como você imagina o plano perfeito?"
- Tactical empathy: valide ANTES de perguntar ("entendo, reajuste tá complicado mesmo")
- Late-night FM DJ voice: tom calmo, seguro, sem pressão

ALEX HORMOZI (100M Offers):
- Ancoragem: "Planos variam de R$200 a R$1.200 — por isso preciso entender seu perfil"
- Stack de benefícios: quando hesita, empilhe valor ("por esse valor você tem: rede nacional + quarto individual + sem carência")
- Urgência real (nunca falsa): "Tabelas mudam dia 1º" / "Essa condição é dessa semana"
- Dream outcome: "Imagina ter um plano que cobre tudo que você precisa por menos do que paga hoje?"

JORDAN BELFORT (Straight Line):
- Controle do frame: sempre direcione pro próximo passo
- Certeza: transmita que SABE o que tá fazendo
- Looping: se desvia, traga de volta ("entendi, mas voltando pro plano...")
- Tonalidade: confiança absoluta

QUANDO USAR:
- Lead curto (1-3 palavras) → Mirroring + pergunta aberta
- Lead preocupado → Labeling + tactical empathy
- Lead pediu preço → Ancoragem + dream outcome
- Lead desviando → Looping (Belfort)
- Lead cooperativo → Avance direto, sem técnica pesada
- Lead com pressa → Direto ao ponto, respeite o tempo
- Lead desconfiado → Tactical empathy + prova social ("atendo mais de 200 empresas na região")

## FEW-SHOT: CONVERSAS QUE CONVERTERAM

### Exemplo 1: Lead PJ direto (converteu em 6 turnos)
LEAD: "Oi, preciso de plano pra minha empresa, 12 funcionários"
JUNIOR: "Show! 12 vidas já pega tabela PME com condições boas. Qual a faixa de idade do pessoal? Pode ser aproximado."
LEAD: "Entre 25 e 40 anos"
JUNIOR: "Perfeito, faixa jovem — isso puxa o valor pra baixo. Vocês são de qual cidade?"
LEAD: "Campinas SP"
JUNIOR: "Campinas tem rede boa. Me conta: é primeiro plano da empresa ou tão trocando de operadora?"
LEAD: "Trocando, tamo na Hapvida mas a rede é ruim"
JUNIOR: "Entendi, rede limitada. Faz sentido trocar. Com 12 vidas em Campinas, faixa 25-40, consigo Unimed e SulAmérica com rede muito mais ampla. Pra quando vocês precisam?"
LEAD: "Esse mês se possível"
JUNIOR: "Beleza, urgente então. Última coisa: tem uma faixa de valor por pessoa em mente? Tipo até R$500, até R$800?"
LEAD: "Até uns 600"
JUNIOR: "Perfeito! Com esse perfil tenho pelo menos 3 opções excelentes. Vou montar a cotação agora e te mando hoje ainda com tudo detalhado. Como posso te chamar?"

### Exemplo 2: Lead PF inseguro (converteu com empatia)
LEAD: "Boa tarde, queria saber sobre plano de saúde"
JUNIOR: "Boa tarde! Aqui é o Junior, consultor de planos. Trabalho com as principais operadoras — Unimed, Amil, Bradesco, SulAmérica. É plano pra você ou pra família?"
LEAD: "Pra mim e minha esposa"
JUNIOR: "Casal, 2 vidas. Qual a faixa de idade de vocês?"
LEAD: "Eu tenho 34 e ela 31"
JUNIOR: "Ótima faixa, valor fica bem acessível. Vocês são de qual cidade?"
LEAD: "São Paulo, zona leste"
JUNIOR: "SP zona leste, beleza. Me conta: vocês já têm plano hoje ou seria o primeiro?"
LEAD: "Temos pela empresa dela mas ela vai sair"
JUNIOR: "Ah entendi — então vocês podem fazer portabilidade! Isso significa que mantêm a carência que já cumpriram. Não começam do zero."
‖
"Pra quando ela sai da empresa? Isso define o prazo."
LEAD: "Mês que vem"
JUNIOR: "Perfeito, dá tempo de sobra. Com 2 vidas, 31 e 34, SP zona leste, portabilidade — tenho opções a partir de R$350/pessoa com rede boa. Vou montar as 3 melhores pra vocês. Como posso te chamar?"

### Exemplo 3: Lead que só quer preço (converteu com ancoragem)
LEAD: "Quanto custa um plano de saúde?"
JUNIOR: "Depende muito do perfil! Planos variam de R$200 a R$1.500 por pessoa. Pra te dar um valor real, preciso entender sua situação. É pra você sozinho ou tem mais gente?"
LEAD: "Só pra mim"
JUNIOR: "Beleza, individual. Qual sua idade?"
LEAD: "28"
JUNIOR: "28 anos, faixa mais barata. Qual cidade?"
LEAD: "BH"
JUNIOR: "BH tem bastante opção boa. Você já tem plano hoje ou seria o primeiro?"
LEAD: "Primeiro plano"
JUNIOR: "Entendi. Pra você ter uma ideia: com 28 anos em BH, planos bons começam em R$280 e vão até R$600 dependendo da rede e cobertura. Tem uma faixa de valor que faz sentido pra você?"
LEAD: "Até uns 400"
JUNIOR: "Com R$400 em BH você pega planos com rede completa — hospital, lab, pronto-socorro. Vou separar as 3 melhores opções pro seu perfil. Como posso te chamar?"

## PRIMEIRA MENSAGEM (CRÍTICO — REGRA ABSOLUTA)
Se é a PRIMEIRA vez que você responde a esse lead (não tem histórico de assistant no chat), você OBRIGATORIAMENTE deve:
1. Se apresentar: "Aqui é o Junior" ou "Junior aqui" (SEMPRE, sem exceção)
2. Mostrar expertise em 1 frase ("consultor de planos" ou "trabalho com as principais operadoras")
3. Fazer UMA pergunta direcionada que já coleta dado
4. Transmitir confiança e calor humano

Isso vale INDEPENDENTE do que o lead mandou. Mesmo se ele perguntou preço, mesmo se mandou áudio, mesmo se é MEI. SEMPRE se apresente na primeira resposta.

NUNCA comece com:
- "Oi, tudo bem?" (sem direção)
- "Como posso ajudá-lo?" (robótico)
- "Obrigado pelo contato" (corporativo)
- Qualquer frase que não avance a conversa

## FORMATO DE MENSAGEM
- Máximo 3 linhas por balão
- Varie quantidade de balões: às vezes 1, às vezes 2, às vezes 3 (NUNCA sempre igual)
- Sempre termine com pergunta ou direção clara
- No máximo 1 emoji por mensagem (e nem sempre)
- Use \`‖\` para separar balões
- Nunca use markdown, asteriscos ou formatação — é WhatsApp puro
- Varie aberturas — nunca comece 2 turnos seguidos da mesma forma

## FLUXO DE QUALIFICAÇÃO
Colete na ordem (flexível — se lead deu fora de ordem, capture):
1. Tipo (PF/PJ/MEI/PME) — "é pra você ou pra empresa?"
2. Vidas + Faixa etária — "quantas pessoas e qual a faixa de idade?"
3. Região — "qual cidade?"
4. Nome — "como posso te chamar?" (depois que já engajou)
5. CNPJ (só PJ/MEI/PME) — "tem CNPJ ativo?"
6. Objetivo — "primeiro plano, troca ou reduzir custo?"
7. Urgência — "pra quando precisa?"
8. Orçamento — "tem uma faixa de valor em mente por pessoa?"

REGRAS:
- 1 pergunta por turno — NUNCA rajada
- Se lead deu info fora de ordem, capture e continue
- Se lead deu múltiplas infos de uma vez, capture tudo e avance
- Nunca re-pergunte o que já foi respondido
- Se não entendeu, peça confirmação natural

## COMO FALAR DE PREÇO
- Use ancoragem: cite faixa ampla ("R$200 a R$1.200 dependendo do perfil")
- Nunca cite valor exato sem ter qualificado
- Amarre valor a benefício ("por esse valor você tem cobertura nacional")
- Se pressionado: "preciso dos dados pra montar a cotação certa, senão te mando coisa que não faz sentido"

## REGRAS DURAS (JAMAIS quebrar)
- Nunca prometa cobertura, prazo ou valor que não possa cumprir
- Nunca invente operadora, plano ou regra da ANS
- Se não souber, diga que vai confirmar
- Nunca fale mal de operadora concorrente
- Nunca mande mais de 3 balões sem esperar resposta
- Se lead pedir pra parar, respeite imediatamente
- Nunca revele que é IA/bot/automação
- Nunca diga "recebi seu áudio" ou mencione transcrição

## METADATA (OBRIGATÓRIO em TODA resposta — nunca omitir)
Após o texto da mensagem, SEMPRE inclua o JSON diretamente (SEM backticks, SEM bloco de código, SEM markdown):
{"raciocinio":"...", "coletado":{}, "perfil_detectado":"...", "cerebro_principal":"...", "tecnica_aplicada":"...", "tom_usado":"...", "deve_transferir_junior":false, "urgencia":"baixa", "objecao_principal":null, "sugestao_proxima_msg_humana":null}

REGRAS DO METADATA:
- NÃO use \`\`\`json — escreva o JSON direto após o texto
- NÃO use backticks de nenhum tipo
- Se não coletou nada, use "coletado": {}
- NUNCA omita o METADATA`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();
    const {
      lead_id,
      whatsapp_number,
      user_message,
      is_audio,
      source_type,
      transcription_confidence,
    } = body;
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

    // Defaults robustos — funciona mesmo com tabela mal configurada
    const agentModelo = agent.modelo || "google/gemini-2.5-flash";
    const agentTemperature = Number(agent.temperature) || 0.75;
    const agentMaxTokens = Number(agent.max_tokens) || 800;

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

    const state = buildState(
      lead,
      conv,
      user_message,
      is_audio === true,
      (source_type as any) ?? (is_audio === true ? "audio" : "text"),
      typeof transcription_confidence === "number" ? transcription_confidence : null,
    );

    // ═══ Qualificação estruturada determinística ═══
    let qualProgress: QualProgress = evaluateQualification(state.coletado);
    console.log(`[SDR qual] score=${qualProgress.score} pct=${qualProgress.pct} next=${qualProgress.next_question_field ?? "-"} oos=${qualProgress.out_of_scope}`);

    // ═══ ÁUDIO RUIM/INAUDÍVEL: short-circuit humano, sem LLM ═══
    // Para volume alto de campanha: o áudio NUNCA pode quebrar a conversa
    // nem fazer o agente afirmar coisas que não entendeu.
    if (is_audio === true && state.transcription_quality !== "good") {
      const opcoes = [
        "Deu uma falhada aqui no áudio, não peguei tudo. Me confirma rapidinho por texto: é pra você (PF) ou pra empresa (PJ)?",
        "Não consegui escutar direito o áudio 😅 me conta em texto: tá buscando plano pra quantas pessoas?",
        "Deu chiado aqui, não peguei. Me manda em texto: o que exatamente você tá precisando?",
      ];
      const escolhido = opcoes[Math.floor(Math.random() * opcoes.length)];
      const balao = escolhido;

      // Atualiza conversa com a mensagem do cliente + a resposta de clarificação
      const novasMensagens = [
        ...((conv?.mensagens ?? []) as any[]),
        { role: "user", content: user_message },
        { role: "assistant", content: balao },
      ];
      if (conversation_id) {
        await supabase.from("agent_conversations").update({
          status: "ativa",
          mensagens: novasMensagens,
          balao_count: ((conv?.balao_count ?? 0) as number) + 2,
          ultima_atividade: new Date().toISOString(),
          conversation_state: state as any,
        }).eq("id", conversation_id);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          conversation_id,
          mensagens: [balao],
          delays_ms: [1500],
          qualificou: false,
          metadata: {
            short_circuit: "audio_unintelligible",
            transcription_quality: state.transcription_quality,
            transcription_confidence: state.transcription_confidence,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Anúncio detectado serve só pra enriquecer o contexto da conversa —
    // NÃO interfere mais na decisão de silenciar. Junior responde a qualquer
    // mensagem de leads em estágios pré-cotação.
    const anuncio = isAnuncioMessage(user_message);

    // ═══ GUARDS: únicas situações onde o Junior NÃO deve responder ═══
    const ESTAGIOS_AVANCADOS = [
      "cotacao_enviada", "proposta_enviada", "negociacao",
      "fechamento", "ganho", "implantacao", "cliente_ativo",
    ];
    const motivoSilenciar: string | null =
      state.contexto_cliente.assumido_corretor
        ? "lead_assumido_pelo_corretor"
        : state.contexto_cliente.ja_e_cliente
        ? "cliente_existente_detectado_na_memoria"
        : (state.contexto_cliente.estagio && ESTAGIOS_AVANCADOS.includes(state.contexto_cliente.estagio))
        ? `estagio_avancado:${state.contexto_cliente.estagio}`
        : null;

    console.log(`[SDR routing] lead=${lead_id} anuncio_match=${anuncio.match} pattern=${anuncio.pattern ?? "-"} estagio=${state.contexto_cliente.estagio ?? "-"} motivoSilenciar=${motivoSilenciar ?? "ATENDER"}`);

    if (motivoSilenciar) {
      console.log(`Junior silenciado para lead ${lead_id}: ${motivoSilenciar}`);
      if (lead?.user_id) {
        const titulo =
          motivoSilenciar === "cliente_existente_detectado_na_memoria"
            ? "Junior pausou — cliente existente"
            : motivoSilenciar.startsWith("estagio")
            ? "Junior pausou — lead em estágio avançado"
            : "Junior pausou — lead já está com você";
        const corpo = `Não respondi ${lead.name || lead.phone} pelo Junior (${motivoSilenciar}).\n\nCliente disse: "${user_message.slice(0, 140)}"\n\nResponde direto.`;
        await supabase.from("notifications").insert({
          user_id: lead.user_id,
          type: "sdr_silenced_existing_client",
          title: titulo,
          body: corpo,
          lead_id,
        });
      }
      if (conversation_id) {
        await supabase.from("agent_conversations").update({
          status: "pausada",
          ultima_atividade: new Date().toISOString(),
          conversation_state: state as any,
          mensagens: [...((conv?.mensagens ?? []) as any[]), { role: "user", content: user_message }],
        }).eq("id", conversation_id);
      }
      return new Response(
        JSON.stringify({ ok: false, silenced: true, reason: motivoSilenciar }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ═══ Detecta campanha de tráfego pago ═══
    const { data: campaignsRaw } = await supabase
      .from("campaign_triggers")
      .select("*")
      .eq("agent_slug", AGENT_SLUG)
      .eq("ativo", true);
    const campaigns = (campaignsRaw ?? []) as CampaignTrigger[];
    const extra_utm = (body as any).utm ?? null;
    const campaignDetection: CampaignDetection | null = detectCampaign(user_message, campaigns, extra_utm);
    if (campaignDetection) {
      console.log(`[SDR campaign] match="${campaignDetection.campaign.nome}" method=${campaignDetection.method} conf=${campaignDetection.confidence.toFixed(2)}`);
      // Aplica preset_context: enriquece coletado e retira da falta o que a campanha já presume
      const preset = campaignDetection.campaign.preset_context || {};
      for (const [k, v] of Object.entries(preset)) {
        if (v !== undefined && v !== null && v !== "" && !(k in state.coletado)) {
          (state.coletado as Record<string, unknown>)[k] = v;
        }
      }
      const skip = new Set(campaignDetection.campaign.skip_questions || []);
      state.falta = state.falta.filter((k) => !skip.has(k) && !(k in state.coletado));
    }

    // ═══ Pré-seleção (pruning) de mentes/técnicas ═══
    const signal = classifySignal(user_message);
    const [fewShot, allBrains, allTechniques] = await Promise.all([
      selectFewShot(supabase, state),
      fetchAllBrains(supabase),
      fetchAllTechniques(supabase),
    ]);
    const prunedBrains = pruneBrains(
      allBrains,
      signal,
      campaignDetection?.campaign.preferred_brain_ids ?? [],
      5,
    );
    const prunedTechniques = pruneTechniques(
      allTechniques,
      signal,
      campaignDetection?.campaign.preferred_technique_ids ?? [],
      4,
    );
    const brainsBlock = buildBrainsBlockFromRows(prunedBrains);
    const techniquesBlock = buildTechniquesBlockFromRows(prunedTechniques);

    // Mapas nome→id para logging do crítico semântico
    const brainNameToId = new Map<string, string>();
    for (const b of prunedBrains) {
      if (b.vendor_profiles) brainNameToId.set(b.vendor_profiles.nome.toLowerCase(), b.vendor_profiles.id);
    }
    const techniqueNameToId = new Map<string, string>();
    const techniqueNameToHowto = new Map<string, string>();
    for (const t of prunedTechniques) {
      if (t.sales_techniques) {
        techniqueNameToId.set(t.sales_techniques.nome.toLowerCase(), t.sales_techniques.id);
        techniqueNameToHowto.set(t.sales_techniques.nome.toLowerCase(), t.sales_techniques.como_aplicar);
      }
    }
    const brainNameToDesc = new Map<string, string>();
    for (const b of prunedBrains) {
      if (b.vendor_profiles) {
        const v = b.vendor_profiles;
        const desc = [v.principios, v.quando_usar].filter(Boolean).join(" | ");
        brainNameToDesc.set(v.nome.toLowerCase(), desc);
      }
    }

    const historico = (conv?.mensagens ?? []) as Array<{ role: string; content: string }>;

    // System prompt: SEMPRE usa o fallback completo (vendedor nato).
    // O prompt da tabela é ignorado — o fallback é a fonte de verdade.
    const rawPrompt = generateFallbackSystemPrompt();
    const personaPrompt = await renderPersonaInPrompt(supabase, rawPrompt, AGENT_SLUG);

    const systemWithContext = personaPrompt +
      brainsBlock +
      techniquesBlock +
      "\n\n═══ CONTEXTO DO CLIENTE (memória do CRM — USE ATIVAMENTE) ═══\n" +
      `ESTÁGIO_FUNIL: ${state.contexto_cliente.estagio ?? "novo"}\n` +
      `OPERADORA_ATUAL: ${state.contexto_cliente.operadora_atual ?? "nenhuma cadastrada"}\n` +
      `COTAÇÃO_JÁ_ENVIADA: ${state.contexto_cliente.cotacao_enviada ? "SIM" : "não"}\n` +
      `DIAS_DESDE_ÚLTIMA_ATIVIDADE: ${state.contexto_cliente.ultima_atividade_dias ?? "n/a"}\n` +
      (state.contexto_cliente.memoria_resumo
        ? `\n📋 RESUMO DO HISTÓRICO COM ESTE CLIENTE:\n${state.contexto_cliente.memoria_resumo}\n`
        : "") +
      (Object.keys(state.contexto_cliente.historico_estruturado).length
        ? `\n📊 DADOS ESTRUTURADOS DA MEMÓRIA: ${JSON.stringify(state.contexto_cliente.historico_estruturado)}\n`
        : "") +
      "\n⚠️ INSTRUÇÃO CRÍTICA SOBRE O CONTEXTO:\n" +
      "- Se houver RESUMO DO HISTÓRICO acima, esse cliente JÁ CONVERSOU com a gente. NÃO trate como lead novo.\n" +
      "- NÃO faça perguntas de qualificação cujas respostas já estão no histórico.\n" +
      "- Conecte explicitamente sua mensagem ao que ele já disse antes (ex: 'da última vez você falou em X, ainda faz sentido?').\n" +
      "- Se o histórico mostra que ele é cliente ativo (boleto, app, carteirinha, 2ª via), passe pro corretor humano IMEDIATAMENTE.\n" +
      "\n\n═══ ESTADO ATUAL DA CONVERSA ═══\n" +
      `COLETADO: ${JSON.stringify(state.coletado)}\n` +
      `FALTA: ${JSON.stringify(state.falta)}\n` +
      `ULTIMA_MSG_CLIENTE: "${state.ultima_msg_cliente}"\n` +
      `PALAVRAS_ULTIMA_MSG: ${state.palavras_ultima_msg}\n` +
      `TOM_CLIENTE: ${state.tom_cliente}\n` +
      `TURN: ${state.turn_number}\n` +
      (anuncio.match
        ? `\n🎯 LEAD NOVO DE ANÚNCIO DETECTADO (gatilho: ${anuncio.pattern}). Trate como interesse ATIVO em cotação — não pergunte se ele quer um plano, ele já disse que quer. Foco em qualificar (tipo PF/PJ, vidas, plano atual, urgência) com calor humano, não questionário.\n`
        : (!state.contexto_cliente.memoria_resumo &&
            !state.contexto_cliente.operadora_atual &&
            (!state.contexto_cliente.estagio ||
              ["novo", "lead_novo", "tentativa_contato", "contato_realizado"].includes(state.contexto_cliente.estagio)))
        ? `\n🆕 LEAD NOVO sem histórico ainda — abordagem consultiva, descubra o que ele busca antes de qualificar.\n`
        : "") +
      (state.veio_por_audio
        ? "\n🎤 ESTA MENSAGEM CHEGOU COMO ÁUDIO. O texto acima é a TRANSCRIÇÃO do áudio do cliente.\n" +
          "REGRAS PARA RESPONDER ÁUDIO:\n" +
          "- NÃO diga 'recebi seu áudio', 'ouvi seu áudio', 'entendi seu áudio'.\n" +
          "- NÃO repita a transcrição literal nem cite que é uma transcrição.\n" +
          "- Responda como se estivesse numa conversa fluida — exatamente como você responderia a um texto.\n" +
          "- Se a transcrição estiver confusa/incompleta, peça pra repetir de forma natural ('não peguei tudo, me conta de novo?').\n" +
          "- Mantenha o split em balões e o tom humano de sempre.\n" +
          "- ⚠️ Áudio NÃO é sinal de interesse por si só. Não trate como lead mais quente nem acelere a qualificação só porque veio áudio. Avalie só pelo conteúdo transcrito.\n" +
          (state.transcription_confidence !== null
            ? `- Confiança da transcrição: ${(state.transcription_confidence * 100).toFixed(0)}%. Se baixa, prefira CONFIRMAR antes de afirmar qualquer coisa.\n`
            : "")
        : "") +
      (state.palavras_ultima_msg <= 5
        ? "\n⚠️ CLIENTE RESPONDEU CURTO — SUA PRÓXIMA MENSAGEM DEVE USAR MIRRORING OU LABELING.\n"
        : "") +
      qualProgressBlock(qualProgress) +
      "\n\n═══ META-RACIOCÍNIO OBRIGATÓRIO ═══\n" +
      "Antes de responder, escolha CONSCIENTEMENTE:\n" +
      "1. UM cérebro principal (da lista acima) que vai liderar este turno\n" +
      "2. UMA técnica concreta (da lista acima) que você vai aplicar\n" +
      "3. Como o CONTEXTO DO CLIENTE acima muda sua abordagem\n" +
      "Reporte essas 3 escolhas no METADATA (campos: cerebro_principal, tecnica_aplicada, ajuste_por_contexto).\n" +
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
      const resp = await callGemini(agentModelo, systemWithContext, messages, {
        max_tokens: agentMaxTokens,
        temperature: agentTemperature,
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
          // 2 tentativas falharam — NÃO enviar fallback ruim. Silencia + notifica corretor.
          console.error(`SDR falhou 2× — critérios:`, fails);

          if (lead_id) {
            const { data: leadInfo } = await supabase
              .from("leads").select("user_id, name, phone").eq("id", lead_id).maybeSingle();
            if (leadInfo?.user_id) {
              await supabase.from("notifications").insert({
                user_id: leadInfo.user_id,
                type: "ai_generation_failed",
                title: "SDR travou — responda você",
                body: `Não consegui formular uma resposta decente pra ${leadInfo.name || leadInfo.phone}.\n\nCliente disse: "${user_message.slice(0, 120)}"\n\nAssume a conversa e responde direto.`,
                lead_id,
              });
            }
          }

          if (conversation_id) {
            await supabase.from("agent_conversations").update({
              status: "pausada",
              ultima_atividade: new Date().toISOString(),
            }).eq("id", conversation_id);

            await supabase.from("agent_critic_log").insert({
              conversation_id,
              resposta_proposta: texto || "[vazio]",
              criterios_falhados: fails,
              regenerou: true,
              resposta_final: "[SILENCED — notificado corretor]",
            });
          }

          // Persist whatever was collected even on critic failure
          if (metadata && lead && lead_id) {
            await syncLeadDataFromMetadata(supabase, lead, lead_id, metadata).catch(
              (e) => console.warn("syncLeadDataFromMetadata on critic-fail:", e?.message),
            );
          }

          return new Response(
            JSON.stringify({
              ok: true, silenced: true, reason: "critic_failed_twice",
              conversation_id, mensagens: [], delays_ms: [], qualificou: false,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        } else {
          messages.push({
            role: "user",
            content: `[SISTEMA] Sua resposta anterior falhou: ${fails.join(", ")}. Regenere corrigindo.`,
          });
        }
      }
    }

    if (!propostaFinal) propostaFinal = "Pode me dar um segundinho?";

    // ═══ Crítico semântico (LLM-as-judge) — valida ancoragem de cérebro/técnica ═══
    const cerebroDeclarado: string | null = metadata?.cerebro_principal ?? null;
    const tecnicaDeclarada: string | null = metadata?.tecnica_aplicada ?? null;
    const cerebroDesc = cerebroDeclarado
      ? brainNameToDesc.get(cerebroDeclarado.toLowerCase()) ?? null
      : null;
    const tecnicaHowto = tecnicaDeclarada
      ? techniqueNameToHowto.get(tecnicaDeclarada.toLowerCase()) ?? null
      : null;
    const verdict = await judgeAnchoring({
      resposta: propostaFinal,
      cerebro_declarado: cerebroDeclarado,
      cerebro_descricao: cerebroDesc,
      tecnica_declarada: tecnicaDeclarada,
      tecnica_como_aplicar: tecnicaHowto,
      ultima_msg_cliente: state.ultima_msg_cliente,
    });
    console.log(`[SDR semantic-critic] approved=${verdict.approved} conf=${verdict.confidence.toFixed(2)} reason="${verdict.reason}"`);

    // ═══ Telemetria: mente_usage_log ═══
    try {
      await supabase.from("mente_usage_log").insert({
        conversation_id,
        agent_slug: AGENT_SLUG,
        turn_number: state.turn_number,
        cerebro_declarado: cerebroDeclarado,
        tecnica_declarada: tecnicaDeclarada,
        cerebro_id: cerebroDeclarado
          ? brainNameToId.get(cerebroDeclarado.toLowerCase()) ?? null
          : null,
        tecnica_id: tecnicaDeclarada
          ? techniqueNameToId.get(tecnicaDeclarada.toLowerCase()) ?? null
          : null,
        semantic_approved: verdict.approved,
        semantic_confidence: verdict.confidence,
        semantic_reason: verdict.reason,
        evidencia_trecho: verdict.evidencia_trecho,
        resposta_final: propostaFinal.slice(0, 2000),
        ultima_msg_cliente: state.ultima_msg_cliente.slice(0, 1000),
        tom_cliente: state.tom_cliente,
        campaign_id: campaignDetection?.campaign.id ?? null,
      });
    } catch (logErr) {
      console.warn("[mente_usage_log] insert failed:", logErr instanceof Error ? logErr.message : logErr);
    }

    // ═══ Atribuição de campanha (1x por conversa) ═══
    if (campaignDetection && state.turn_number === 1) {
      try {
        await supabase.from("campaign_lead_attributions").insert({
          campaign_id: campaignDetection.campaign.id,
          lead_id,
          conversation_id,
          detection_method: campaignDetection.method,
          detection_confidence: campaignDetection.confidence,
          matched_value: campaignDetection.matched_value.slice(0, 500),
        });
      } catch (attrErr) {
        console.warn("[campaign_attribution] insert failed:", attrErr instanceof Error ? attrErr.message : attrErr);
      }
    }

    // Logs
    await supabase.from("agent_critic_log").insert({
      conversation_id,
      resposta_proposta: propostaFinal,
      criterios_falhados,
      regenerou: attempt > 1,
      resposta_final: propostaFinal,
    });

    // Split em balões
    let baloes = propostaFinal.split(SPLIT_CHAR).map((b) => b.trim()).filter(Boolean);
    // Auto-split: se veio 1 balão longo (>14 palavras), parte em 2 por sentença
    if (baloes.length === 1) {
      const palavras = baloes[0].split(/\s+/).filter(Boolean);
      if (palavras.length > 14) {
        const sentencas = baloes[0].match(/[^.!?…\n]+[.!?…]+|[^.!?…\n]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
        if (sentencas.length >= 2) {
          const meio = Math.ceil(sentencas.length / 2);
          const a = sentencas.slice(0, meio).join(" ").trim();
          const b = sentencas.slice(meio).join(" ").trim();
          if (a && b) baloes = [a, b];
        }
      }
    }
    const palavrasClienteUlt = state.palavras_ultima_msg ?? 5;
    const delays = baloes.map((b, i) => calcularDelay(b, i === 0, palavrasClienteUlt));

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

    // Persiste o que o SDR aprendeu neste turno → usado por buildState no próximo
    if (metadata && lead) {
      await syncLeadDataFromMetadata(supabase, lead, lead_id, metadata);
    }

    // Recalcula qualificação combinando coletado anterior + o que metadata trouxe neste turno.
    const coletadoFinal: Record<string, unknown> = {
      ...state.coletado,
      ...(metadata?.coletado ?? {}),
    };
    const qualFinal = evaluateQualification(coletadoFinal);
    console.log(`[SDR qual final] score=${qualFinal.score} pct=${qualFinal.pct} missing=${JSON.stringify(qualFinal.missing)}`);

    // Handoff só com score A — agente pode pedir, mas gate fecha se faltar dado.
    const aiPediuHandoff = !!metadata?.deve_transferir_junior;
    const qualificou = qualFinal.score === "A" && aiPediuHandoff;
    if (aiPediuHandoff && !qualificou) {
      console.log(`[SDR qual] handoff bloqueado: AI pediu mas score=${qualFinal.score} (faltam ${qualFinal.missing.join(",")})`);
    }

    // Persiste qual_progress dentro de conversation_state pra próximo turno.
    try {
      await supabase.from("agent_conversations").update({
        conversation_state: {
          ...(state as any),
          qual_progress: qualFinal,
        },
      }).eq("id", conversation_id);
    } catch (e) {
      console.warn("[qual_progress] persist failed:", e instanceof Error ? e.message : e);
    }

    // Persiste score auditável diretamente no lead (visível no histórico/UI).
    // Score só desce de A se houver evidência forte (mantemos histórico em action_log).
    const prevScore = (lead as any)?.qual_score ?? null;
    try {
      await supabase.from("leads").update({
        qual_score: qualFinal.score,
        qual_score_reason: qualFinal.reason_summary,
        qual_score_breakdown: {
          overall: qualFinal.breakdown.overall,
          weights: qualFinal.breakdown.weights,
          fit: qualFinal.breakdown.fit,
          urgency: qualFinal.breakdown.urgency,
          completeness: qualFinal.breakdown.completeness,
          closing_potential: qualFinal.breakdown.closing_potential,
          out_of_scope: qualFinal.out_of_scope,
          oos_reasons: qualFinal.reasons,
          missing: qualFinal.missing,
          turn: state.turn_number,
          evaluated_at: new Date().toISOString(),
        },
        qual_score_updated_at: new Date().toISOString(),
      }).eq("id", lead_id);
    } catch (e) {
      console.warn("[lead.qual_score] persist failed:", e instanceof Error ? e.message : e);
    }

    // Log estruturado da qualificação (action_log, se houver lead/user)
    if (lead?.user_id) {
      try {
        await supabase.from("action_log").insert({
          user_id: lead.user_id,
          lead_id,
          action_type: "qual_score_evaluated",
          metadata: {
            score: qualFinal.score,
            previous_score: prevScore,
            score_changed: prevScore !== qualFinal.score,
            overall: qualFinal.breakdown.overall,
            breakdown: qualFinal.breakdown,
            reason_summary: qualFinal.reason_summary,
            pct: qualFinal.pct,
            filled: qualFinal.filled,
            missing: qualFinal.missing,
            out_of_scope: qualFinal.out_of_scope,
            reasons: qualFinal.reasons,
            ai_pediu_handoff: aiPediuHandoff,
            handoff_concedido: qualificou,
            turn: state.turn_number,
          },
        });
        // Log dedicado de mudança de score (mais fácil de filtrar/auditar)
        if (prevScore !== qualFinal.score) {
          await supabase.from("action_log").insert({
            user_id: lead.user_id,
            lead_id,
            action_type: "qual_score_changed",
            metadata: {
              from: prevScore,
              to: qualFinal.score,
              overall: qualFinal.breakdown.overall,
              reason: qualFinal.reason_summary,
              turn: state.turn_number,
            },
          });
        }
      } catch (e) {
        console.warn("[action_log qual] insert failed:", e instanceof Error ? e.message : e);
      }
    }

    // Atualiza atribuição de campanha se qualificou
    if (qualificou && campaignDetection) {
      try {
        await supabase
          .from("campaign_lead_attributions")
          .update({ qualificou: true, qualificou_em: new Date().toISOString() })
          .eq("conversation_id", conversation_id)
          .eq("campaign_id", campaignDetection.campaign.id);
      } catch (e) {
        console.warn("[campaign_attribution] qualified-update failed:", e instanceof Error ? e.message : e);
      }
    }

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
        qual_progress: qualFinal,
        // Handoff payload explícito — não caixa-preta
        handoff_payload: qualificou ? {
          score: qualFinal.score,
          reason: qualFinal.reason_summary,
          breakdown: qualFinal.breakdown,
          missing: qualFinal.missing,
        } : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("junior-sdr v3 error:", msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});