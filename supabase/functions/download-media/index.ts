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
    const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
    const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
    if (!UAZAPI_URL || !UAZAPI_TOKEN) throw new Error("UaZapi credentials not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message_id } = await req.json();
    if (!message_id) throw new Error("message_id is required");

    // Verify message belongs to user
    const { data: msg, error: msgErr } = await supabase
      .from("whatsapp_messages")
      .select("uazapi_message_id, message_type, media_url")
      .eq("id", message_id)
      .single();

    if (msgErr || !msg) throw new Error("Message not found");

    const baseUrl = UAZAPI_URL.replace(/\/+$/, "");
    const h = { "Content-Type": "application/json", token: UAZAPI_TOKEN };

    // Download media via UaZapi
    const resp = await fetch(`${baseUrl}/message/download`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        messageId: msg.uazapi_message_id,
        return_base64: true,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`Download failed: ${resp.status} - ${errText}`);
      throw new Error(`Download failed: ${resp.status}`);
    }

    const data = await resp.json();
    const base64 = data.base64 || data.data || null;
    const mimeType = data.mimetype || data.mimeType || data.contentType || guessMime(msg.message_type);

    if (!base64) {
      throw new Error("No base64 data returned");
    }

    return new Response(JSON.stringify({ 
      base64, 
      mimeType,
      messageType: msg.message_type,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Download error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function guessMime(type: string): string {
  switch (type) {
    case "image": return "image/jpeg";
    case "audio": case "ptt": return "audio/ogg";
    case "video": return "video/mp4";
    case "document": return "application/pdf";
    case "sticker": return "image/webp";
    default: return "application/octet-stream";
  }
}
