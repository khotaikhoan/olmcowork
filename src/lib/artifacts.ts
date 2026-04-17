// Artifact extraction — Claude.ai-style.
// Detects code blocks in assistant messages and converts the largest
// "interesting" ones into artifacts that render in a side panel.

export type ArtifactKind = "html" | "react" | "svg" | "code" | "markdown";

export interface Artifact {
  id: string;            // stable id per (messageId + index)
  messageId: string;
  title: string;
  kind: ArtifactKind;
  language: string;      // raw fence language
  content: string;
  createdAt: number;
}

const FENCE_RE = /```([\w+-]*)\n([\s\S]*?)```/g;

// Languages we always promote to an artifact regardless of length
const ALWAYS_KINDS = new Set(["html", "svg"]);

// Threshold (lines) for generic code to become an artifact
const MIN_LINES = 15;

function detectKind(lang: string, body: string): ArtifactKind | null {
  const l = lang.toLowerCase();
  if (l === "html" || /^<!doctype html|^<html[\s>]/i.test(body.trim())) return "html";
  if (l === "svg" || /^<svg[\s>]/i.test(body.trim())) return "svg";
  if (l === "jsx" || l === "tsx") return "react";
  if (l === "md" || l === "markdown") return "markdown";
  if (l) return "code";
  return null;
}

function titleFor(kind: ArtifactKind, lang: string, body: string): string {
  if (kind === "html") {
    const m = body.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (m) return m[1].trim();
    return "HTML preview";
  }
  if (kind === "svg") return "SVG illustration";
  if (kind === "react") return "React component";
  if (kind === "markdown") return "Markdown document";
  return lang ? `${lang} snippet` : "Code snippet";
}

export function extractArtifacts(messageId: string, content: string): Artifact[] {
  if (!content) return [];
  const out: Artifact[] = [];
  let i = 0;
  let m: RegExpExecArray | null;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(content)) !== null) {
    const lang = (m[1] || "").trim();
    const body = m[2] || "";
    const kind = detectKind(lang, body);
    if (!kind) continue;
    const lines = body.split("\n").length;
    if (!ALWAYS_KINDS.has(kind) && lines < MIN_LINES) continue;
    out.push({
      id: `${messageId}:${i++}`,
      messageId,
      title: titleFor(kind, lang, body),
      kind,
      language: lang || kind,
      content: body,
      createdAt: Date.now(),
    });
  }
  return out;
}

// Build a sandboxed HTML doc for previewing different artifact kinds.
export function buildPreviewHtml(a: Artifact): string {
  if (a.kind === "html") return a.content;
  if (a.kind === "svg") {
    return `<!doctype html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fafaf7">${a.content}</body></html>`;
  }
  if (a.kind === "markdown") {
    // Render via marked CDN inside the sandbox (no host JS needed)
    const escaped = a.content.replace(/<\/script>/g, "<\\/script>");
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#1f1d1a;line-height:1.6}
      pre{background:#f4f1ec;padding:1rem;border-radius:8px;overflow:auto}
      code{font-family:ui-monospace,Menlo,monospace}
      h1,h2,h3{font-family:Georgia,serif}
    </style></head><body><div id="out"></div>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>document.getElementById('out').innerHTML = marked.parse(${JSON.stringify(escaped)});</script>
    </body></html>`;
  }
  // react / generic code → no live preview, only code view
  return "";
}

export function canPreview(a: Artifact): boolean {
  return a.kind === "html" || a.kind === "svg" || a.kind === "markdown";
}
