// Cron worker: pega mensagens em scheduled_messages com status='queued' e
// send_at <= now(), e dispara o send-whatsapp com skip_window_check=true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: pending } = await supabase
      .from("scheduled_messages")
      .select("*")
      .eq("status", "queued")
      .lte("send_at", new Date().toISOString())
      .limit(50);

    if (!pending || pending.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let processed = 0, failed = 0;
    for (const msg of pending) {
      try {
        const { data: resp, error } = await supabase.functions.invoke("send-whatsapp", {
          body: {
            phone: msg.phone,
            message: msg.message,
            lead_id: msg.lead_id,
            user_id: msg.user_id,
            skip_window_check: true,
          },
        });
        if (error || !resp?.success) {
          throw new Error(error?.message || resp?.error || "send failed");
        }
        await supabase.from("scheduled_messages")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", msg.id);
        processed++;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        await supabase.from("scheduled_messages")
          .update({ status: "failed", error: errMsg })
          .eq("id", msg.id);
        failed++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});