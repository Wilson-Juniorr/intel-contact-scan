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

    const uazapiId = msg.uazapi_message_id;
    // Use same approach as webhook transcription: extract short key after ":"
    const shortId = uazapiId?.includes(":") ? uazapiId.split(":").pop()! : uazapiId;

    console.log(`Downloading media: msg=${message_id}, uazapi=${uazapiId}, shortId=${shortId}, type=${msg.message_type}`);

    let downloadData: any = null;

    // Method 1: UaZapi POST /message/download with short ID (same as working webhook)
    if (shortId) {
      try {
        const resp = await fetch(`${baseUrl}/message/download`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({ id: shortId, return_base64: true }),
        });
        const text = await resp.text();
        console.log(`/message/download id=${shortId}: status=${resp.status}, len=${text.length}`);
        
        if (resp.ok) {
          try {
            const parsed = JSON.parse(text);
            const b64 = parsed.base64Data || parsed.base64 || parsed.data || parsed.result;
            if (b64 && typeof b64 === "string" && b64.length > 100) {
              downloadData = { base64: b64, mimetype: parsed.mimetype || parsed.mimeType || "" };
              console.log("Download via API success");
            }
          } catch {}
        }
      } catch (e) {
        console.error("API download error:", e);
      }
    }

    // Method 2: Try with full uazapi_message_id
    if (!downloadData && uazapiId && uazapiId !== shortId) {
      try {
        const resp = await fetch(`${baseUrl}/message/download`, {
          method: "POST",
          headers: h,
          body: JSON.stringify({ id: uazapiId, return_base64: true }),
        });
        if (resp.ok) {
          const parsed = await resp.json();
          const b64 = parsed.base64Data || parsed.base64 || parsed.data;
          if (b64 && typeof b64 === "string" && b64.length > 100) {
            downloadData = { base64: b64, mimetype: parsed.mimetype || parsed.mimeType || "" };
            console.log("Download via full ID success");
          }
        } else {
          await resp.text(); // consume body
        }
      } catch (e) {
        console.error("Full ID download error:", e);
      }
    }

    // Method 3: Direct media_url fetch (works for recent/non-expired links)
    if (!downloadData && msg.media_url) {
      console.log("Trying direct media_url...");
      try {
        const directResp = await fetch(msg.media_url);
        if (directResp.ok) {
          const buffer = await directResp.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          if (bytes.length > 100) {
            // Convert to base64 efficiently
            const chunkSize = 8192;
            let binary = "";
            for (let i = 0; i < bytes.length; i += chunkSize) {
              const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
              for (let j = 0; j < chunk.length; j++) {
                binary += String.fromCharCode(chunk[j]);
              }
            }
            const contentType = directResp.headers.get("content-type") || "";
            downloadData = { base64: btoa(binary), mimetype: contentType };
            console.log(`Direct download success: ${contentType}, ${binary.length} bytes`);
          }
        } else {
          await directResp.text();
          console.log("Direct URL failed:", directResp.status);
        }
      } catch (e) {
        console.error("Direct download error:", e);
      }
    }

    if (!downloadData?.base64) {
      throw new Error("Could not download media from any source");
    }

    const mimeType = downloadData.mimetype || guessMime(msg.message_type);

    return new Response(JSON.stringify({
      base64: downloadData.base64,
      mimeType,
      messageType: msg.message_type,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Download error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errMsg }), {
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
