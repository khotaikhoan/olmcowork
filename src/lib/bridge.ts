// Bridge — dispatch Anthropic-style tools (computer / bash / text_editor)
// xuống Electron IPC, hoặc fallback mock trong browser.
import { mockExecute, ExecResult } from "./tools";
import { supabase } from "@/integrations/supabase/client";

/** Read-only URL fetch via the public `fetch-meta` edge function. Safe in browser + Electron. */
async function fetchUrlTool(url: string): Promise<ExecResult> {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, output: "fetch_url requires an absolute http(s) URL." };
  }
  try {
    const { data, error } = await supabase.functions.invoke("fetch-meta", { body: { url } });
    if (error) return { ok: false, output: `fetch_url failed: ${error.message}` };
    if (!data || (data as any).error) {
      return { ok: false, output: `fetch_url failed: ${(data as any)?.error ?? "no data"}` };
    }
    const d = data as { url: string; title?: string; description?: string; image?: string | null; favicon?: string };
    const lines = [
      `URL: ${d.url}`,
      d.title ? `Title: ${d.title}` : null,
      d.description ? `Description: ${d.description}` : null,
      d.image ? `Image: ${d.image}` : null,
      d.favicon ? `Favicon: ${d.favicon}` : null,
    ].filter(Boolean);
    return { ok: true, output: lines.join("\n") };
  } catch (e: any) {
    return { ok: false, output: `fetch_url failed: ${e?.message ?? String(e)}` };
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
  const b = typeof window !== "undefined" ? window.bridge : undefined;
  if (!b) return mockExecute(name, args);

  if (name === "bash") {
    return b.runShell(String(args.command ?? ""));
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
