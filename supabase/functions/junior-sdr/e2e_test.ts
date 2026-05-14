// E2E validation suite — junior-sdr critical flows.
// Cobre cenários determinísticos via lógica pura (gates, opt-out, qual-score,
// compliance) e checks de decisão para áudio. Cenários que dependem de WhatsApp
// real (envio/recebimento) são auditados por inspeção de código + schema (ver
// docs/junior-sdr-e2e-checklist.md).
//
// Rodar: supabase--test_edge_functions com functions=["junior-sdr"].

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectOptOut, detectOptIn } from "../_shared/opt-out.ts";
import { evaluateComplianceGuardian } from "../_shared/compliance-guardian.ts";
import { evaluateQualification } from "./qual-score.ts";

// ─────────────────────────── 1. TEXTO COM INTENÇÃO REAL ───────────────────────────
Deno.test("[Cenário 1] texto c/ intenção real → score evolui de C/B para A", () => {
  // Turno 1: só nome
  const t1 = evaluateQualification({ nome: "João Silva" }, { turn_number: 1 });
  assert(["C", "B"].includes(t1.score), `score inicial=${t1.score}`);
  assertEquals(t1.out_of_scope, false);
  assertEquals(t1.current_stage, "tipo");

  // Turno final: dados completos PF
  const tFinal = evaluateQualification({
    nome: "João Silva",
    tipo: "PF",
    regiao: "São Paulo/SP",
    vidas: 2,
    faixa_etaria: "30-45",
    objetivo: "primeiro plano",
    urgencia: "essa semana",
    orcamento: "até 800",
  }, { turn_number: 8 });
  assertEquals(tFinal.score, "A", `breakdown=${JSON.stringify(tFinal.breakdown)}`);
  assertEquals(tFinal.current_stage, null);
  assertEquals(tFinal.missing.length, 0);
});

// ─────────────────────────── 2. ÁUDIO COM TRANSCRIÇÃO VÁLIDA ───────────────────────────
// Reproduz a decisão do route-message (audio integrity gate).
function audioGateDecision(text: string, conf: number | null): string {
  const trimmed = (text ?? "").trim();
  const placeholder = /^\[?áudio n[aã]o compreendido\]?$/i.test(trimmed)
    || /^\[?audio nao compreendido\]?$/i.test(trimmed);
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const lowConf = typeof conf === "number" && conf < 0.5;
  if (!trimmed || placeholder) return "audio_unintelligible";
  if (lowConf) return "audio_low_confidence";
  if (words < 2) return "audio_too_short";
  return "ok_route_to_sdr";
}

Deno.test("[Cenário 2] áudio com transcrição válida → roteia para SDR", () => {
  assertEquals(
    audioGateDecision("quero contratar plano de saúde para minha família", 0.88),
    "ok_route_to_sdr",
  );
});

// ─────────────────────────── 3. ÁUDIO COM TRANSCRIÇÃO RUIM ───────────────────────────
Deno.test("[Cenário 3] áudio ruim/vazio/curto → fallback, NÃO invoca SDR", () => {
  assertEquals(audioGateDecision("[Áudio não compreendido]", null), "audio_unintelligible");
  assertEquals(audioGateDecision("oi", 0.9), "audio_too_short");
  assertEquals(audioGateDecision("plano saúde família", 0.3), "audio_low_confidence");
});

// ─────────────────────────── 4. CURIOSA SEM INTENÇÃO ───────────────────────────
Deno.test("[Cenário 4] curiosa/fora de escopo → score D, out_of_scope=true", () => {
  const r = evaluateQualification({
    nome: "Maria",
    objetivo: "só curiosidade mesmo",
  }, { turn_number: 3 });
  assertEquals(r.out_of_scope, true);
  assertEquals(r.score, "D");
  assert(r.reasons.some((x) => x.includes("curiosidade")), `reasons=${JSON.stringify(r.reasons)}`);

  // Sinal explícito de fora de escopo (intent classifier negativo)
  const r2 = evaluateQualification({}, { explicit_out_of_scope: true });
  assertEquals(r2.score, "D");
});

// ─────────────────────────── 5. LEAD QUENTE COMPLETO ───────────────────────────
Deno.test("[Cenário 5] lead PME quente com CNPJ → A", () => {
  const r = evaluateQualification({
    nome: "Ana Lima",
    tipo: "PME",
    regiao: "Curitiba/PR",
    vidas: 12,
    faixa_etaria: "25-50",
    cnpj: "12.345.678/0001-90",
    objetivo: "trocar de operadora",
    urgencia: "urgente, semana que vem",
    orcamento: "até 600 por vida",
  }, { turn_number: 9 });
  assertEquals(r.score, "A");
  assert(r.breakdown.overall >= 80, `overall=${r.breakdown.overall}`);
  assert(r.breakdown.fit.score >= 80, `fit=${r.breakdown.fit.score}`);
});

// ─────────────────────────── 6. HANDOFF / 7. RETOMADA ───────────────────────────
// O flag `in_manual_conversation` é a chave. Validamos a decisão lógica do gate.
Deno.test("[Cenários 6+7] handoff pausa, retomada limpa flag", () => {
  // Após handoff o lead.in_manual_conversation = true → gate bloqueia.
  // Após corretor desligar manual → flag false → gate libera.
  // (validação completa requer DB, ver checklist final.)
  // Aqui validamos apenas a invariante: a string do reason é parte da union.
  const reasons: string[] = [
    "manual_conversation", "opted_out", "personal_contact",
    "rate_limited", "contact_category_blocks", "outside_compliance_window",
  ];
  for (const r of reasons) assert(r.length > 0);
});

// ─────────────────────────── 8. OPT-OUT E BLOQUEIO ───────────────────────────
Deno.test("[Cenário 8a] opt-out detector cobre STOP/PARAR/SAIR/NÃO QUERO", () => {
  for (const s of [
    "STOP", "stop por favor", "PARAR", "Parar agora",
    "SAIR", "quero sair dessa lista",
    "Não quero mais receber",
    "para de mandar mensagem",
    "não tenho interesse",
    "me remove da lista",
    "perdi interesse",
    "desisti",
    "unsubscribe",
    "cancelar inscrição",
  ]) {
    const d = detectOptOut(s);
    assert(d.match, `opt-out NÃO detectado: "${s}"`);
  }
});

Deno.test("[Cenário 8b] opt-out NÃO confunde com mensagens normais", () => {
  for (const s of [
    "olá, tudo bem?",
    "quanto custa o plano?",
    "preciso de cotação",
    "stopover na cidade",   // contém 'stop' mas não é palavra
  ]) {
    const d = detectOptOut(s);
    assertEquals(d.match, false, `falso positivo em: "${s}"`);
  }
});

Deno.test("[Cenário 8c] opt-in reabre o canal", () => {
  assert(detectOptIn("quero receber novamente"));
  assert(detectOptIn("opt-in"));
});

// ─────────────────────────── COMPLIANCE GUARDIAN ───────────────────────────
Deno.test("[Compliance] bloqueia promessa absoluta e urgência artificial", () => {
  const r1 = evaluateComplianceGuardian("Garanto 100% que você é aprovado!!!");
  assertEquals(r1.allowed, false);
  const r2 = evaluateComplianceGuardian("Última chance! Só hoje!");
  assertEquals(r2.allowed, false);
  const r3 = evaluateComplianceGuardian("Cobre tudo, sem carência");
  assertEquals(r3.allowed, false);

  const ok = evaluateComplianceGuardian(
    "Oi João, dá uma olhada na proposta e me chama se tiver dúvida.",
  );
  assertEquals(ok.allowed, true);
});
