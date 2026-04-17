// Bridge — dispatch Anthropic-style tools (computer / bash / text_editor)
// xuống Electron IPC, hoặc fallback mock trong browser.
import { mockExecute, ExecResult } from "./tools";
import { supabase } from "@/integrations/supabase/client";

// ---------- Generic localStorage TTL cache (used by fetch_url + web_search) ----------
const TOOL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CachedEntry {
  ts: number;
  output: string;
}

function readToolCache(key: string): string | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (!parsed?.ts || Date.now() - parsed.ts > TOOL_CACHE_TTL_MS) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      return null;
    }
    return parsed.output;
  } catch {
    return null;
  }
}

function writeToolCache(prefix: string, key: string, output: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    const payload: CachedEntry = { ts: Date.now(), output };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // quota exceeded — best-effort prune entries with same prefix
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(prefix)) localStorage.removeItem(k);
      }
    } catch { /* ignore */ }
  }
}

const FETCH_URL_PREFIX = "olm:fetch_url:";
const WEB_SEARCH_PREFIX = "olm:web_search:";
const CACHE_HIT_MARKER = "<!--cache_hit-->\n";

/** Read-only URL fetch via the public `fetch-meta` edge function. Safe in browser + Electron. */
async function fetchUrlTool(url: string): Promise<ExecResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, output: "fetch_url requires an absolute http(s) URL." };
  }
  const cacheKey = `${FETCH_URL_PREFIX}${url.trim()}`;
  const cached = readToolCache(cacheKey);
  if (cached) return { ok: true, output: CACHE_HIT_MARKER + cached };
  try {
    const { data, error } = await supabase.functions.invoke("fetch-meta", { body: { url } });
    if (error) return { ok: false, output: `fetch_url failed: ${error.message}` };
    if (!data || (data as any).error) {
      return { ok: false, output: `fetch_url failed: ${(data as any)?.error ?? "no data"}` };
    }
    const d = data as {
      url: string;
      title?: string;
      description?: string;
      image?: string | null;
      favicon?: string;
      body?: string;
      bodyTruncated?: boolean;
    };
    const lines = [
      `URL: ${d.url}`,
      d.title ? `Title: ${d.title}` : null,
      d.description ? `Description: ${d.description}` : null,
      d.image ? `Image: ${d.image}` : null,
      d.body ? `\nContent${d.bodyTruncated ? " (truncated to 4KB)" : ""}:\n${d.body}` : null,
    ].filter(Boolean);
    const output = lines.join("\n");
    writeToolCache(FETCH_URL_PREFIX, cacheKey, output);
    return { ok: true, output };
  } catch (e: any) {
    return { ok: false, output: `fetch_url failed: ${e?.message ?? String(e)}` };
  }
}

/** Read-only web search via the public `web-search` edge function (DuckDuckGo). */
async function webSearchTool(query: string, limit?: number): Promise<ExecResult> {
  if (!query?.trim()) return { ok: false, output: "web_search requires a non-empty query." };
  const n = limit ?? 5;
  const cacheKey = `${WEB_SEARCH_PREFIX}${n}:${query.trim().toLowerCase()}`;
  const cached = readToolCache(cacheKey);
  if (cached) return { ok: true, output: CACHE_HIT_MARKER + cached };
  try {
    const { data, error } = await supabase.functions.invoke("web-search", {
      body: { query, limit: n },
    });
    if (error) return { ok: false, output: `web_search failed: ${error.message}` };
    if (!data || (data as any).error) {
      return { ok: false, output: `web_search failed: ${(data as any)?.error ?? "no data"}` };
    }
    const results = ((data as any).results ?? []) as { title: string; url: string; snippet: string }[];
    if (!results.length) return { ok: true, output: `No results for "${query}".` };
    const text = results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join("\n\n");
    const marker = `<!--web_search:${JSON.stringify({ query, results })}-->\n`;
    const output = marker + text;
    writeToolCache(WEB_SEARCH_PREFIX, cacheKey, output);
    return { ok: true, output };
  } catch (e: any) {
    return { ok: false, output: `web_search failed: ${e?.message ?? String(e)}` };
  }
}

export interface VisionMark {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  role?: string;
  label?: string;
  source?: "ax-mac" | "uia-win" | "grid";
  app?: string;
}

export interface BridgeAPI {
  isElectron: boolean;
  info: () => Promise<{ platform: string; arch: string; home: string; version: string; hasScreenshot: boolean }>;
  readFile: (path: string) => Promise<ExecResult>;
  listDir: (path: string) => Promise<ExecResult>;
  writeFile: (path: string, content: string) => Promise<ExecResult>;
  runShell: (command: string) => Promise<ExecResult>;
  screenshot: () => Promise<ExecResult & { image?: string }>;
  visionAnnotate: () => Promise<ExecResult & { image?: string; marks?: VisionMark[] }>;
  visionClick: (markId: number, button?: "left" | "right" | "middle") => Promise<ExecResult>;
  mouseMove: (x: number, y: number) => Promise<ExecResult>;
  mouseClick: (x: number, y: number, button?: "left" | "right" | "middle") => Promise<ExecResult>;
  typeText: (text: string) => Promise<ExecResult>;
  keyPress: (key: string) => Promise<ExecResult>;
  startOllama: () => Promise<ExecResult & { running?: boolean }>;
  stopOllama: () => Promise<ExecResult & { running?: boolean }>;
  ollamaStatus: () => Promise<ExecResult & { running: boolean; managed: boolean }>;
  getFrontmostApp: () => Promise<ExecResult & { app: string | null }>;
  listApps: () => Promise<ExecResult & { apps: string[] }>;
}

declare global {
  interface Window {
    bridge?: BridgeAPI;
  }
}

export const isElectron = (): boolean =>
  typeof window !== "undefined" && !!window.bridge?.isElectron;

export interface ToolExecResult extends ExecResult {
  image?: string;
  marks?: VisionMark[];
}

/**
 * Read string-replace-once (text_editor.str_replace requires unique match).
 */
async function readForEdit(b: BridgeAPI, path: string): Promise<string | null> {
  const r = await b.readFile(path);
  return r.ok ? r.output : null;
}

export async function executeTool(
  name: string,
  args: Record<string, any>,
): Promise<ToolExecResult> {
  // fetch_url + web_search are browser-safe (server-side proxies) and work without Electron.
  if (name === "fetch_url") {
    return fetchUrlTool(String(args.url ?? ""));
  }
  if (name === "web_search") {
    return webSearchTool(String(args.query ?? ""), Number(args.limit) || undefined);
  }
  const b = typeof window !== "undefined" ? window.bridge : undefined;
  if (!b) return mockExecute(name, args);

  if (name === "bash") {
    return b.runShell(String(args.command ?? ""));
  }

  // observe_screen = screenshot + AX annotate (Phase 2 vision loop primary "eyes")
  if (name === "observe_screen") {
    const r = await b.visionAnnotate();
    const marks = r.marks ?? [];
    const summary = marks.length
      ? `Captured screen + ${marks.length} accessible controls. Marks (id · role · label):\n${marks
          .slice(0, 60)
          .map((m) => `${m.id}. ${m.role ?? "?"} — ${m.label ?? "(no label)"}`)
          .join("\n")}${marks.length > 60 ? `\n…(${marks.length - 60} more)` : ""}`
      : "Captured screen. No accessible controls detected — may need pixel-level computer.* fallback.";
    return { ok: r.ok, output: summary, image: r.image, marks };
  }

  if (name === "vision_click") {
    const action = String(args.action ?? "");
    if (action === "annotate") {
      return b.visionAnnotate();
    }
    if (action === "click") {
      const id = Number(args.mark_id);
      if (!id) return { ok: false, output: "mark_id required" };
      const button = (args.button as "left" | "right" | "middle") ?? "left";
      return b.visionClick(id, button);
    }
    return { ok: false, output: `Unknown vision_click action: ${action}` };
  }

  if (name === "text_editor") {
    const action = String(args.action ?? "");
    const path = String(args.path ?? "");
    switch (action) {
      case "view":
        return b.readFile(path);
      case "list_dir":
        return b.listDir(path);
      case "create":
        return b.writeFile(path, String(args.file_text ?? ""));
      case "str_replace": {
        const cur = await readForEdit(b, path);
        if (cur === null) return { ok: false, output: `Cannot read ${path} for editing` };
        const oldStr = String(args.old_str ?? "");
        const newStr = String(args.new_str ?? "");
        const occurrences = cur.split(oldStr).length - 1;
        if (occurrences === 0) return { ok: false, output: `old_str not found in ${path}` };
        if (occurrences > 1)
          return {
            ok: false,
            output: `old_str matched ${occurrences} times in ${path}; provide a more unique snippet.`,
          };
        const next = cur.replace(oldStr, newStr);
        return b.writeFile(path, next);
      }
      default:
        return { ok: false, output: `Unknown text_editor action: ${action}` };
    }
  }

  if (name === "computer") {
    const action = String(args.action ?? "");
    const coord: number[] = Array.isArray(args.coordinate) ? args.coordinate : [];
    const [x, y] = [Number(coord[0]), Number(coord[1])];
    switch (action) {
      case "screenshot": {
        const r = await b.screenshot();
        return { ok: r.ok, output: r.output, image: r.image };
      }
      case "mouse_move":
        return b.mouseMove(x, y);
      case "left_click":
        return b.mouseClick(x, y, "left");
      case "right_click":
        return b.mouseClick(x, y, "right");
      case "middle_click":
        return b.mouseClick(x, y, "middle");
      case "double_click": {
        await b.mouseClick(x, y, "left");
        return b.mouseClick(x, y, "left");
      }
      case "type":
        return b.typeText(String(args.text ?? ""));
      case "key":
        return b.keyPress(String(args.key ?? ""));
      default:
        return { ok: false, output: `Unknown computer action: ${action}` };
    }
  }

  return { ok: false, output: `Unknown tool: ${name}` };
}
