import type { VendorProfile } from "@/hooks/useVendorProfiles";
import type { SalesTechnique } from "@/hooks/useSalesTechniques";

export type BuilderState = {
  // Step 1 - Identity
  nome: string;
  slug: string;
  tipo: "front_line" | "meta" | "junior";
  descricao: string;
  persona_resumo: string; // ex: "SDR consultiva, calorosa, objetiva"
  // Step 2 - Brains (vendor profiles) selected with weight
  brains: { id: string; peso: number }[];
  // Step 3 - Techniques selected with priority
  techniques: { id: string; prioridade: number }[];
  // Step 4 - Objections (free-list, used in prompt)
  objections: { gatilho: string; resposta: string }[];
  // Step 5 - Pricing/quote behavior
  precoMode: "evitar" | "ancorar" | "transparente";
  precoNotas: string;
  // Step 6 - Flow / qualification fields to collect
  fluxoCampos: string[]; // ex: ["tipo (PF/PJ)", "vidas", "plano atual"]
  // Step 7 - Risks / hard rules / blocklist
  blocklist: string[];
  regrasDuras: string[];
  // Model config
  modelo: string;
  temperature: number;
  max_tokens: number;
};

export const DEFAULT_BUILDER: BuilderState = {
  nome: "",
  slug: "",
  tipo: "front_line",
  descricao: "",
  persona_resumo: "",
  brains: [],
  techniques: [],
  objections: [],
  precoMode: "ancorar",
  precoNotas: "",
  fluxoCampos: [],
  blocklist: [],
  regrasDuras: [],
  modelo: "google/gemini-3-flash-preview",
  temperature: 0.7,
  max_tokens: 1500,
};

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function generateSystemPrompt(
  state: BuilderState,
  vendorProfiles: VendorProfile[],
  techniques: SalesTechnique[],
): string {
  const selectedBrains = state.brains
    .map((b) => ({ ...vendorProfiles.find((v) => v.id === b.id)!, peso: b.peso }))
    .filter((b) => b.id)
    .sort((a, b) => b.peso - a.peso);

  const selectedTechs = state.techniques
    .map((t) => ({ ...techniques.find((x) => x.id === t.id)!, prioridade: t.prioridade }))
    .filter((t) => t.id)
    .sort((a, b) => b.prioridade - a.prioridade);

  const lines: string[] = [];

  // 1 — Identity
  lines.push(`# ${state.nome.toUpperCase()} — ${state.descricao || state.tipo}`);
  lines.push("");
  lines.push(`Você é **${state.nome}**. ${state.persona_resumo}`);
  lines.push("");

  // 2 — Brains
  if (selectedBrains.length) {
    lines.push("## 🧠 Cérebros que te formam");
    lines.push("Você combina o melhor de cada um destes especialistas (ordenado por peso):");
    lines.push("");
    for (const b of selectedBrains) {
      lines.push(`### ${b.nome} ${b.origem ? `(${b.origem})` : ""} — peso ${b.peso}/10`);
      if (b.tom) lines.push(`- **Tom:** ${b.tom}`);
      if (b.estilo) lines.push(`- **Estilo:** ${b.estilo}`);
      if (b.principios) lines.push(`- **Princípios:** ${b.principios}`);
      if (b.quando_usar) lines.push(`- **Quando usar:** ${b.quando_usar}`);
      if (b.evitar_quando) lines.push(`- **Evitar quando:** ${b.evitar_quando}`);
      if (b.exemplos_frases?.length) {
        lines.push(`- **Frases-modelo:**`);
        for (const f of b.exemplos_frases.slice(0, 3)) lines.push(`  - "${f}"`);
      }
      lines.push("");
    }
  }

  // 3 — Techniques
  if (selectedTechs.length) {
    lines.push("## 🎯 Técnicas que você domina");
    for (const t of selectedTechs) {
      lines.push(`### ${t.nome} — prioridade ${t.prioridade}/10 (${t.categoria})`);
      if (t.descricao) lines.push(t.descricao);
      lines.push(`**Como aplicar:** ${t.como_aplicar}`);
      if (t.gatilho_uso) lines.push(`**Use quando:** ${t.gatilho_uso}`);
      if (t.exemplos?.length) {
        const ex = t.exemplos[0];
        lines.push(`**Exemplo:** Cliente: "${ex.cliente}" → Você: "${ex.agente}"`);
      }
      lines.push("");
    }
  }

  // 4 — Objections
  if (state.objections.length) {
    lines.push("## 💬 Objeções comuns e respostas-modelo");
    for (const o of state.objections) {
      lines.push(`- **Cliente diz:** "${o.gatilho}"`);
      lines.push(`  **Você responde:** ${o.resposta}`);
    }
    lines.push("");
  }

  // 5 — Price
  lines.push("## 💰 Como falar de preço");
  const precoTexto = {
    evitar: "Nunca cite valores. Sempre redirecione para a cotação personalizada.",
    ancorar: "Use ancoragem: cite uma faixa ampla (ex: 'planos de R$ 200 a R$ 1.200') antes de qualificar para um valor específico.",
    transparente: "Seja transparente com valores quando perguntado, mas sempre amarrado a benefícios.",
  }[state.precoMode];
  lines.push(precoTexto);
  if (state.precoNotas) lines.push(state.precoNotas);
  lines.push("");

  // 6 — Flow
  if (state.fluxoCampos.length) {
    lines.push("## 📋 O que coletar nesta conversa");
    lines.push("Você precisa descobrir, de forma natural (sem soar como questionário):");
    for (const c of state.fluxoCampos) lines.push(`- ${c}`);
    lines.push("");
    lines.push("Colete 1 ou 2 itens por mensagem. Nunca dispare uma rajada de perguntas.");
    lines.push("");
  }

  // 7 — Hard rules
  lines.push("## 🚫 Regras duras (jamais quebrar)");
  lines.push("- Nunca prometa cobertura, prazo ou valor que não possa cumprir.");
  lines.push("- Nunca invente nome de operadora, plano ou regra ANS.");
  lines.push("- Se não souber, diga que vai confirmar com o time.");
  for (const r of state.regrasDuras) lines.push(`- ${r}`);
  if (state.blocklist.length) {
    lines.push("");
    lines.push("**Palavras/expressões proibidas:** " + state.blocklist.map((b) => `"${b}"`).join(", "));
  }
  lines.push("");

  // Format
  lines.push("## ✍️ Formato das respostas");
  lines.push("- Mensagens curtas, estilo WhatsApp humano (1-3 linhas).");
  lines.push("- Use `‖` para separar balões quando precisar quebrar.");
  lines.push("- No máximo 1 emoji por mensagem.");
  lines.push("- Sempre termine com uma pergunta ou um próximo passo claro.");

  return lines.join("\n");
}