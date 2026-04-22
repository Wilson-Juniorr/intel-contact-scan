import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase credentials not configured");
    }

    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    if (!UAZAPI_URL) throw new Error("UAZAPI_URL not configured");

    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
    if (!UAZAPI_TOKEN) throw new Error("UAZAPI_TOKEN not configured");

    const serviceSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const isInternalServiceCall = token === SUPABASE_SERVICE_ROLE_KEY;
    const { phone, message, lead_id, user_id } = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: "phone and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let userId: string | null = user_id ?? null;
    let supabase = serviceSupabase;

    if (!isInternalServiceCall) {
      const userSupabase = createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: claimsData, error: claimsError } = await userSupabase.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      userId = claimsData.claims.sub;
      supabase = userSupabase;
    }

    if (!userId && lead_id) {
      const { data: leadOwner } = await serviceSupabase
        .from("leads")
        .select("user_id")
        .eq("id", lead_id)
        .maybeSingle();
      userId = leadOwner?.user_id ?? null;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unable to resolve user context" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Formata número: remove tudo que não é dígito, garante formato correto
    const cleanPhone = phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    // Envia via UaZapi V2 — endpoint correto: /send/text
    const baseUrl = UAZAPI_URL.replace(/\/+$/, "");
    const uazapiResp = await fetch(`${baseUrl}/send/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: UAZAPI_TOKEN,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: message,
      }),
    });

    const uazapiData = await uazapiResp.json();

    if (!uazapiResp.ok) {
      console.error("UaZapi error:", JSON.stringify(uazapiData));
      throw new Error(`UaZapi API error [${uazapiResp.status}]: ${JSON.stringify(uazapiData)}`);
    }

    // Salva a mensagem no histórico
    const { error: dbError } = await serviceSupabase.from("whatsapp_messages").insert({
      user_id: userId,
      lead_id: lead_id || null,
      phone: formattedPhone,
      direction: "outbound",
      message_type: "text",
      content: message,
      uazapi_message_id: uazapiData?.key?.id || uazapiData?.messageId || null,
      status: "sent",
    });

    if (dbError) {
      console.error("DB insert error:", JSON.stringify(dbError));
      // Não falha a request - a msg foi enviada com sucesso
    }

    // Atualiza last_contact_at do lead
    if (lead_id) {
      await serviceSupabase
        .from("leads")
        .update({ last_contact_at: new Date().toISOString() })
        .eq("id", lead_id)
        .eq("user_id", userId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId: uazapiData?.key?.id || uazapiData?.messageId || null,
        uazapi: uazapiData,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("send-whatsapp error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
