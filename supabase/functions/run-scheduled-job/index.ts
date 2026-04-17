// Edge function: chạy 1 cloud scheduled job qua Lovable AI Gateway.
// Gọi từ pg_cron (mỗi phút) — function tự pick các job đến hạn của TẤT CẢ user
// dựa vào `cron` + `last_run_at`. Tối giản: hỗ trợ cron dạng "*/N * * * *" và "M H * * *".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Job {
  id: string;
  user_id: string;
  name: string;
  cron: string;
  prompt: string;
  model: string | null;
  last_run_at: string | null;
}

function shouldRun(cron: string, lastRunAt: string | null, now: Date): boolean {
  // Very small cron parser: supports
  //  - "*/N * * * *"  → every N minutes
  //  - "M H * * *"    → daily at H:M (UTC)
  //  - "M * * * *"    → every hour at minute M
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h] = parts;

  const last = lastRunAt ? new Date(lastRunAt).getTime() : 0;
  const elapsedMin = (now.getTime() - last) / 60000;

  if (m.startsWith("*/")) {
    const n = parseInt(m.slice(2), 10);
    if (!n || n < 1) return false;
    return elapsedMin >= n - 0.5;
  }

  const minute = parseInt(m, 10);
  if (Number.isNaN(minute)) return false;

  if (h === "*") {
    return now.getUTCMinutes() === minute && elapsedMin >= 0.5;
  }
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return false;
  return (
    now.getUTCHours() === hour &&
    now.getUTCMinutes() === minute &&
    elapsedMin >= 0.5
  );
}

async function callLovableAI(prompt: string, model: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "Bạn là agent chạy theo lịch. Trả lời ngắn gọn, tập trung vào kết quả thực thi prompt.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (r.status === 429) throw new Error("Rate limit (429)");
  if (r.status === 402) throw new Error("Hết credit Lovable AI (402)");
  if (!r.ok) throw new Error(`Gateway ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "(no content)";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // pg_cron sẽ POST vào đây mỗi phút. Cũng có thể gọi tay từ UI để chạy ngay.
  let manualJobId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    manualJobId = body.job_id ?? null;
  } catch {}

  const now = new Date();
  let query = supa
    .from("scheduled_jobs")
    .select("id,user_id,name,cron,prompt,model,last_run_at,job_type,enabled");
  if (manualJobId) {
    query = query.eq("id", manualJobId);
  } else {
    query = query.eq("enabled", true).eq("job_type", "cloud");
  }
  const { data: jobs, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ranIds: string[] = [];
  for (const job of (jobs ?? []) as Job[]) {
    if (!manualJobId && !shouldRun(job.cron, job.last_run_at, now)) continue;

    const { data: run } = await supa
      .from("job_runs")
      .insert({
        job_id: job.id,
        user_id: job.user_id,
        status: "running",
      })
      .select("id")
      .single();

    try {
      const output = await callLovableAI(
        job.prompt,
        job.model || "google/gemini-3-flash-preview",
      );
      await supa
        .from("job_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "ok",
          output: output.slice(0, 50_000),
        })
        .eq("id", run!.id);
      await supa
        .from("scheduled_jobs")
        .update({ last_run_at: new Date().toISOString() })
        .eq("id", job.id);
      ranIds.push(job.id);
    } catch (e) {
      await supa
        .from("job_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "error",
          error: String((e as Error).message ?? e),
        })
        .eq("id", run!.id);
      await supa
        .from("scheduled_jobs")
        .update({ last_run_at: new Date().toISOString() })
        .eq("id", job.id);
    }
  }

  return new Response(
    JSON.stringify({ ran: ranIds.length, ids: ranIds }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
