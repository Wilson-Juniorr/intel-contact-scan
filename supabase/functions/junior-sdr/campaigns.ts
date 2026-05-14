// Detecção de campanha de tráfego pago.
// Ordem: 1) UTM exato 2) frase exata 3) frase fuzzy (similaridade)

export interface CampaignTrigger {
  id: string;
  nome: string;
  ativo: boolean;
  utm_codes: string[];
  trigger_phrases: string[];
  fuzzy_threshold: number;
  preset_context: Record<string, unknown>;
  skip_questions: string[];
  opening_message: string | null;
  preferred_brain_ids: string[];
  preferred_technique_ids: string[];
}

export interface CampaignDetection {
  campaign: CampaignTrigger;
  method: "utm" | "phrase_exact" | "phrase_fuzzy";
  confidence: number;
  matched_value: string;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Jaccard similarity de tokens — barato e suficiente pra frases curtas
function jaccard(a: string, b: string): number {
  const ta = new Set(normalize(a).split(" ").filter(Boolean));
  const tb = new Set(normalize(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return inter / union;
}

// Extrai utm_source/utm_campaign de uma string que pode conter URL ou query string
function extractUtm(text: string): string | null {
  if (!text) return null;
  const m = text.match(/utm_(?:campaign|source|content|medium)=([a-z0-9_\-]+)/i);
  return m ? m[1].toLowerCase() : null;
}

export function detectCampaign(
  user_message: string,
  campaigns: CampaignTrigger[],
  extra_utm?: string | null,
): CampaignDetection | null {
  if (!campaigns?.length) return null;
  const ativos = campaigns.filter((c) => c.ativo);
  if (!ativos.length) return null;

  // 1) UTM (mais confiável). Pode vir do texto OU do extra_utm (ex: query do wa.me)
  const utm = extra_utm?.toLowerCase() || extractUtm(user_message);
  if (utm) {
    for (const c of ativos) {
      if (c.utm_codes.some((code) => code.toLowerCase() === utm)) {
        return { campaign: c, method: "utm", confidence: 1.0, matched_value: utm };
      }
    }
  }

  // 2) Match exato de substring (case-insensitive, sem acentos)
  const normMsg = normalize(user_message);
  for (const c of ativos) {
    for (const phrase of c.trigger_phrases) {
      const np = normalize(phrase);
      if (np && normMsg.includes(np)) {
        return { campaign: c, method: "phrase_exact", confidence: 0.95, matched_value: phrase };
      }
    }
  }

  // 3) Fuzzy (jaccard) — o melhor acima do threshold
  let best: CampaignDetection | null = null;
  for (const c of ativos) {
    for (const phrase of c.trigger_phrases) {
      const sim = jaccard(user_message, phrase);
      if (sim >= c.fuzzy_threshold && (!best || sim > best.confidence)) {
        best = { campaign: c, method: "phrase_fuzzy", confidence: sim, matched_value: phrase };
      }
    }
  }
  return best;
}