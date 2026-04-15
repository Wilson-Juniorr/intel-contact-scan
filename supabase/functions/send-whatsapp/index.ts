import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    if (!UAZAPI_URL) throw new Error("UAZAPI_URL not configured");

    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
    if (!UAZAPI_TOKEN) throw new Error("UAZAPI_TOKEN not configured");

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    const { phone, message, lead_id } = await req.json();

    if (!phone || !message) {
      return new Response(
        JSON.stringify({ error: "phone and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
    const { error: dbError } = await supabase.from("whatsapp_messages").insert({
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
      await supabase
        .from("leads")
        .update({ last_contact_at: new Date().toISOString() })
        .eq("id", lead_id);
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
