import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const COST_PER_INPUT_TOKEN = 0.000000075; // Gemini Flash Lite
const COST_PER_OUTPUT_TOKEN = 0.0000003;

export async function checkAndTrackUsage(
  userId: string,
  functionName: string,
  model = "gemini-2.5-flash-lite"
): Promise<{ allowed: boolean; error?: string; supabaseAdmin: ReturnType<typeof createClient> }> {
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const today = new Date().toISOString().split("T")[0];
  const { data: todayUsage } = await supabaseAdmin
    .from("api_usage")
    .select("input_tokens, output_tokens")
    .eq("user_id", userId)
    .gte("created_at", today);

  const totalTokens = (todayUsage || []).reduce(
    (sum: number, r: { input_tokens: number; output_tokens: number }) =>
      sum + (r.input_tokens || 0) + (r.output_tokens || 0),
    0
  );

  const { data: settings } = await supabaseAdmin
    .from("user_settings")
    .select("daily_token_limit, ai_enabled")
    .eq("user_id", userId)
    .maybeSingle();

  const limit = settings?.daily_token_limit ?? 500000;
  const aiEnabled = settings?.ai_enabled ?? true;

  if (!aiEnabled || totalTokens >= limit) {
    return {
      allowed: false,
      error: "Limite de IA atingido hoje. Tente novamente amanhã.",
      supabaseAdmin,
    };
  }

  return { allowed: true, supabaseAdmin };
}

export async function recordUsage(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  functionName: string,
  responseData: { usage?: { prompt_tokens?: number; completion_tokens?: number } },
  model = "gemini-2.5-flash-lite"
): Promise<void> {
  const usage = responseData.usage || {};
  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  const costUsd = inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN;

  await supabaseAdmin
    .from("api_usage")
    .insert({
      user_id: userId,
      function_name: functionName,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: costUsd,
    })
    .then(() => {})
    .catch((e: Error) => console.error("Erro ao registrar uso:", e));
}
