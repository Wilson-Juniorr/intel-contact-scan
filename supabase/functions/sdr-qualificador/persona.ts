// Lê persona_config e substitui placeholders no system prompt.
export async function renderPersonaInPrompt(
  supabase: any,
  rawPrompt: string,
  agentSlug: string,
): Promise<string> {
  const { data: persona } = await supabase
    .from("agent_persona_config")
    .select("*")
    .eq("agent_slug", agentSlug)
    .maybeSingle();

  const nomeAssistente = persona?.nome_assistente || "";
  const nomeCorretor = persona?.nome_corretor || "";
  const nomeEmpresa = persona?.nome_empresa || "";
  const cidade = persona?.cidade || "São Paulo";
  const segmento = persona?.segmento || "planos de saúde e seguros";

  let rendered = rawPrompt
    .replaceAll("{{nome_assistente}}", nomeAssistente)
    .replaceAll("{{nome_corretor}}", nomeCorretor)
    .replaceAll("{{nome_empresa}}", nomeEmpresa)
    .replaceAll("{{cidade}}", cidade)
    .replaceAll("{{segmento}}", segmento);

  // Blocos condicionais: {{#if nome_corretor}}texto{{/if}}
  rendered = rendered.replace(/\{\{#if nome_corretor\}\}([\s\S]*?)\{\{\/if\}\}/g,
    nomeCorretor ? "$1" : "");
  rendered = rendered.replace(/\{\{#if nome_empresa\}\}([\s\S]*?)\{\{\/if\}\}/g,
    nomeEmpresa ? "$1" : "");
  rendered = rendered.replace(/\{\{#if nome_assistente\}\}([\s\S]*?)\{\{\/if\}\}/g,
    nomeAssistente ? "$1" : "");

  return rendered;
}