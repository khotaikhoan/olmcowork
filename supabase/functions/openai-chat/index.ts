// Edge function: proxy tới OpenAI Chat Completions
// Hỗ trợ cả streaming (không tools) và non-streaming (có tools, trả tool_calls).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY chưa được cấu hình" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Thiếu Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Không xác thực được" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const model: string = body.model ?? "gpt-4o-mini";
    const messages: any[] = Array.isArray(body.messages) ? body.messages : [];
    const tools: any[] | undefined = Array.isArray(body.tools) && body.tools.length > 0 ? body.tools : undefined;
    const stream: boolean = body.stream !== false && !tools; // có tools → non-stream

    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "Thiếu messages" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: Record<string, unknown> = { model, messages, stream };
    if (tools) {
      payload.tools = tools;
      payload.tool_choice = "auto";
    }

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!openaiRes.ok) {
      const txt = await openaiRes.text();
      return new Response(
        JSON.stringify({ error: `OpenAI ${openaiRes.status}: ${txt}` }),
        { status: openaiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (stream && openaiRes.body) {
      return new Response(openaiRes.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming JSON (tools mode)
    const json = await openaiRes.json();
    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
