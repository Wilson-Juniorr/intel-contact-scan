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

    const uazapiId = msg.uazapi_message_id;
    // The stored ID format is "owner:messageKey" — try multiple formats
    const messageKey = uazapiId?.includes(":") ? uazapiId.split(":").pop() : uazapiId;
    
    console.log(`Downloading media for message ${message_id}, uazapi_id: ${uazapiId}, key: ${messageKey}`);

    // Try with full ID first, then just the key part
    let downloadResp: Response | null = null;
    let downloadData: any = null;

    for (const idToTry of [uazapiId, messageKey]) {
      if (!idToTry) continue;
      
      // Try different parameter names the API might expect
      for (const paramName of ["messageId", "id", "message_id"]) {
        try {
          const body: any = { [paramName]: idToTry, return_base64: true };
          console.log(`Trying ${paramName}=${idToTry}`);
          
          const resp = await fetch(`${baseUrl}/message/download`, {
            method: "POST",
            headers: h,
            body: JSON.stringify(body),
          });

          const text = await resp.text();
          
          if (resp.ok) {
            try {
              downloadData = JSON.parse(text);
              if (downloadData.base64 || downloadData.data) {
                console.log(`Success with ${paramName}=${idToTry}`);
                downloadResp = resp;
                break;
              }
            } catch {}
          } else {
            console.log(`${paramName}=${idToTry} → ${resp.status}: ${text.slice(0, 100)}`);
          }
        } catch (e) {
          console.error(`Error trying ${paramName}=${idToTry}:`, e);
        }
      }
      if (downloadData?.base64 || downloadData?.data) break;
    }

    // If API download fails, try using media_url directly (may work for recent messages)
    if (!downloadData?.base64 && !downloadData?.data && msg.media_url) {
      console.log("API download failed, trying direct media_url fetch...");
      try {
        const directResp = await fetch(msg.media_url);
        if (directResp.ok) {
          const buffer = await directResp.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const b64 = btoa(binary);
          const contentType = directResp.headers.get("content-type") || guessMime(msg.message_type);
          downloadData = { base64: b64, mimetype: contentType };
          console.log(`Direct download success: ${contentType}, ${b64.length} chars`);
        }
      } catch (e) {
        console.error("Direct download also failed:", e);
      }
    }

    if (!downloadData?.base64 && !downloadData?.data) {
      throw new Error("Could not download media from any source");
    }

    const base64 = downloadData.base64 || downloadData.data || null;
    const mimeType = downloadData.mimetype || downloadData.mimeType || downloadData.contentType || guessMime(msg.message_type);

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
