import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  evaluateAutomationGate,
  logAutomationBlock,
} from "../_shared/automation-gate.ts";
import {
  evaluateComplianceGuardian,
  logComplianceViolation,
} from "../_shared/compliance-guardian.ts";

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
    const { phone, message, lead_id, user_id, skip_window_check, agent_slug } = await req.json();

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

    // ═══ GATE ÚNICO DE AUTOMAÇÃO (revalidação fail-closed) ═══
    // Só é aplicado quando a chamada é assumidamente automática (vem com
    // agent_slug). Envios manuais do corretor pela interface NÃO passam por aqui.
    if (agent_slug) {
      const cleanForGate = String(phone).replace(/\D/g, "");
      const phoneForGate = cleanForGate.startsWith("55") ? cleanForGate : `55${cleanForGate}`;

      const gate = await evaluateAutomationGate(serviceSupabase, {
        user_id: userId,
        phone: phoneForGate,
        lead_id: lead_id ?? null,
        agent_slug,
        skip_window_check: !!skip_window_check,
      });

      if (!gate.allowed) {
        await logAutomationBlock(serviceSupabase, gate, {
          user_id: userId,
          lead_id: lead_id ?? null,
          agent_slug,
          stage: "send_whatsapp",
          phone: phoneForGate,
          message_preview: String(message ?? "").slice(0, 280),
        });
        return new Response(
          JSON.stringify({
            success: false,
            blocked: true,
            reason: gate.reason,
            metadata: gate.metadata ?? null,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // ═══ GUARDIÃO DE COMPLIANCE (conteúdo) ═══
      // Aplica em TODO envio automático (qualquer agent_slug). Envio manual não passa.
      const guardian = evaluateComplianceGuardian(String(message ?? ""));
      if (!guardian.allowed) {
        await logComplianceViolation(serviceSupabase, {
          user_id: userId,
          lead_id: lead_id ?? null,
          agent_slug,
          stage: "send_whatsapp",
          message_original: String(message ?? ""),
          violations: guardian.violations,
          suggested_fix: guardian.suggested_fix ?? null,
          blocked: true,
        });
        return new Response(
          JSON.stringify({
            success: false,
            blocked: true,
            reason: "compliance_guardian",
            violations: guardian.violations,
            suggested_fix: guardian.suggested_fix ?? null,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // ═══ fim guardião ═══
    }
    // ═══ fim gate ═══

    // ═══ COMPLIANCE — janela de horário (Onda 1) ═══
    if (!skip_window_check) {
      const { data: settings } = await serviceSupabase
        .from("compliance_settings")
        .select("window_start, window_end, timezone, weekdays_only, ativo")
        .eq("user_id", userId)
        .maybeSingle();

      // Fallback: se não tem config, usa 8h-20h BRT (nunca manda de madrugada)
      const effectiveSettings = (settings?.ativo)
        ? settings
        : { window_start: "08:00", window_end: "20:00", timezone: "America/Sao_Paulo", weekdays_only: false, ativo: true };

      if (effectiveSettings.ativo) {
        const now = new Date();
        const fmt = new Intl.DateTimeFormat("pt-BR", {
          timeZone: effectiveSettings.timezone,
          hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
        }).formatToParts(now);
        const hour = parseInt(fmt.find((p) => p.type === "hour")!.value, 10);
        const minute = parseInt(fmt.find((p) => p.type === "minute")!.value, 10);
        const weekday = fmt.find((p) => p.type === "weekday")!.value.toLowerCase();
        const isWeekend = weekday.startsWith("sáb") || weekday.startsWith("sab") || weekday.startsWith("dom");

        const currentMinutes = hour * 60 + minute;
        const [sh, sm] = String(effectiveSettings.window_start).split(":").map(Number);
        const [eh, em] = String(effectiveSettings.window_end).split(":").map(Number);
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;

        const outsideWindow = currentMinutes < startMin || currentMinutes >= endMin;
        const blockedByWeekday = effectiveSettings.weekdays_only && isWeekend;

        if (outsideWindow || blockedByWeekday) {
          // Calcula "próxima janela válida" considerando timezone do user
          // (Brasil fixo UTC-3 desde 2019)
          const BR_OFFSET = "-03:00";
          const pad = (n: number) => String(n).padStart(2, "0");

          const spDateFmt = new Intl.DateTimeFormat("en-CA", {
            timeZone: effectiveSettings.timezone,
            year: "numeric", month: "2-digit", day: "2-digit",
          });
          const [yStr, mStr, dStr] = spDateFmt.format(now).split("-");
          const y = parseInt(yStr, 10);
          const m = parseInt(mStr, 10);
          const d = parseInt(dStr, 10);

          const startStr = String(effectiveSettings.window_start).slice(0, 5); // "08:00"
          let next = new Date(`${y}-${pad(m)}-${pad(d)}T${startStr}:00${BR_OFFSET}`);

          // Se já passou, avança até achar um dia válido
          while (next.getTime() <= now.getTime()) {
            next = new Date(next.getTime() + 86_400_000);
          }

          if (effectiveSettings.weekdays_only) {
            const wkFmt = new Intl.DateTimeFormat("en-US", {
              timeZone: effectiveSettings.timezone,
              weekday: "short",
            });
            while (true) {
              const wk = wkFmt.format(next);
              if (wk !== "Sat" && wk !== "Sun") break;
              next = new Date(next.getTime() + 86_400_000);
            }
          }

          await serviceSupabase.from("scheduled_messages").insert({
            user_id: userId,
            lead_id: lead_id ?? null,
            phone,
            message,
            agent_slug: agent_slug ?? null,
            send_at: next.toISOString(),
            status: "queued",
          });

          return new Response(JSON.stringify({
            success: true,
            queued: true,
            send_at: next.toISOString(),
            reason: outsideWindow ? "outside_hours" : "weekend",
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }
    // ═══ fim compliance ═══

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
