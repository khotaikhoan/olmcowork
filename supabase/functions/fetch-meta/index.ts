// Fetch URL metadata (og:title, description, favicon) for smart paste preview.
// Public (no auth) — only fetches HEAD HTML and parses meta tags. Capped at 200KB.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function pickMeta(html: string, names: string[]): string | null {
  for (const n of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']+)["']`,
      "i",
    );
    const m = html.match(re);
    if (m) return m[1];
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${n}["']`,
      "i",
    );
    const m2 = html.match(re2);
    if (m2) return m2[1];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const u = new URL(url);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(u.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; OllamaCowork-Preview/1.0; +https://olmcowork.lovable.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(t);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html")) {
      return new Response(
        JSON.stringify({
          url: u.toString(),
          title: u.hostname,
          description: ct,
          favicon: `${u.origin}/favicon.ico`,
          image: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < 200_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    reader.cancel().catch(() => {});
    const html = new TextDecoder().decode(
      new Uint8Array(chunks.flatMap((c) => Array.from(c))).slice(0, 200_000),
    );

    const title =
      pickMeta(html, ["og:title", "twitter:title"]) ??
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ??
      u.hostname;
    const description =
      pickMeta(html, ["og:description", "twitter:description", "description"]) ??
      "";
    const image = pickMeta(html, ["og:image", "twitter:image"]);
    const favicon =
      html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
      "/favicon.ico";
    const faviconAbs = favicon.startsWith("http")
      ? favicon
      : new URL(favicon, u.origin).toString();

    return new Response(
      JSON.stringify({
        url: u.toString(),
        title: title.slice(0, 200),
        description: description.slice(0, 300),
        image: image ?? null,
        favicon: faviconAbs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "fetch failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
