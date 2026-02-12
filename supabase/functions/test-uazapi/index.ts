const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const UAZAPI_URL = Deno.env.get("UAZAPI_URL")!.replace(/\/+$/, "");
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN")!;

  const testBody = JSON.stringify({ number: "5500000000000", text: "test" });
  const results: Record<string, any> = {};

  // Test 1: POST /sendText with Bearer auth
  try {
    const r = await fetch(`${UAZAPI_URL}/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${UAZAPI_TOKEN}` },
      body: testBody,
    });
    results["bearer_sendText"] = { status: r.status, body: (await r.text()).substring(0, 300) };
  } catch (e: any) { results["bearer_sendText"] = { error: e.message }; }

  // Test 2: POST /sendText with apitoken header
  try {
    const r = await fetch(`${UAZAPI_URL}/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apitoken: UAZAPI_TOKEN },
      body: testBody,
    });
    results["apitoken_sendText"] = { status: r.status, body: (await r.text()).substring(0, 300) };
  } catch (e: any) { results["apitoken_sendText"] = { error: e.message }; }

  // Test 3: GET /sendText with token (maybe it needs GET?)
  try {
    const r = await fetch(`${UAZAPI_URL}/sendText`, {
      method: "GET",
      headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
    });
    results["get_sendText"] = { status: r.status, body: (await r.text()).substring(0, 300) };
  } catch (e: any) { results["get_sendText"] = { error: e.message }; }

  // Test 4: POST /message/send-text with Bearer
  try {
    const r = await fetch(`${UAZAPI_URL}/message/send-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${UAZAPI_TOKEN}` },
      body: testBody,
    });
    results["bearer_message_send-text"] = { status: r.status, body: (await r.text()).substring(0, 300) };
  } catch (e: any) { results["bearer_message_send-text"] = { error: e.message }; }

  // Test 5: Check root endpoint
  try {
    const r = await fetch(`${UAZAPI_URL}/`, { method: "GET" });
    results["root_get"] = { status: r.status, body: (await r.text()).substring(0, 500) };
  } catch (e: any) { results["root_get"] = { error: e.message }; }

  // Test 6: Check /docs or /api
  try {
    const r = await fetch(`${UAZAPI_URL}/instance/status`, {
      method: "GET",
      headers: { token: UAZAPI_TOKEN },
    });
    results["instance_status"] = { status: r.status, body: (await r.text()).substring(0, 300) };
  } catch (e: any) { results["instance_status"] = { error: e.message }; }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
