// Web search via DuckDuckGo HTML endpoint — no API key required.
// Returns up to N results with { title, url, snippet }. Public (no auth).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** DuckDuckGo HTML wraps the real URL in /l/?uddg=<encoded>. Unwrap it. */
function unwrapDuckUrl(href: string): string {
  try {
    const u = new URL(href, "https://duckduckgo.com");
    const ud = u.searchParams.get("uddg");
    if (ud) return decodeURIComponent(ud);
    return u.toString();
  } catch {
    return href;
  }
}

function parseDuckHtml(html: string, limit: number): SearchResult[] {
  const out: SearchResult[] = [];
  // Each result: <a class="result__a" href="...">TITLE</a> ... <a class="result__snippet" ...>SNIPPET</a>
  const re =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < limit) {
    const url = unwrapDuckUrl(m[1]);
    const title = stripTags(m[2]);
    const snippet = stripTags(m[3]);
    if (url && title) out.push({ title, url, snippet });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { query, limit } = await req.json();
    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "query required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const n = Math.min(Math.max(Number(limit) || 5, 1), 10);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Ochat-WebSearch/1.0; +https://olmcowork.lovable.app)",
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html",
      },
      body: new URLSearchParams({ q: query, kl: "wt-wt" }).toString(),
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(t);

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `upstream ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const html = await res.text();
    const results = parseDuckHtml(html, n);

    return new Response(
      JSON.stringify({ query, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "search failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
