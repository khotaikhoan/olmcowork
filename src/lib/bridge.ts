// Real bridge: dispatches to Electron's window.bridge if present, otherwise mock.
import { mockExecute, ExecResult } from "./tools";

interface BridgeAPI {
  isElectron: boolean;
  info: () => Promise<{ platform: string; arch: string; home: string; version: string; hasScreenshot: boolean }>;
  readFile: (path: string) => Promise<ExecResult>;
  listDir: (path: string) => Promise<ExecResult>;
  writeFile: (path: string, content: string) => Promise<ExecResult>;
  runShell: (command: string) => Promise<ExecResult>;
  screenshot: () => Promise<ExecResult & { image?: string }>;
  mouseMove: (x: number, y: number) => Promise<ExecResult>;
  mouseClick: (x: number, y: number, button?: "left" | "right" | "middle") => Promise<ExecResult>;
  typeText: (text: string) => Promise<ExecResult>;
  keyPress: (key: string) => Promise<ExecResult>;
}

declare global {
  interface Window {
    bridge?: BridgeAPI;
  }
}

export const isElectron = (): boolean =>
  typeof window !== "undefined" && !!window.bridge?.isElectron;

export interface ToolExecResult extends ExecResult {
  /** Base64-encoded PNG (no data: prefix), present for screenshot tool. */
  image?: string;
}

export async function executeTool(
  name: string,
  args: Record<string, any>,
): Promise<ToolExecResult> {
  const b = typeof window !== "undefined" ? window.bridge : undefined;
  if (!b) {
    // Browser → mock
    return mockExecute(name, args);
  }
  switch (name) {
    case "read_file":
      return b.readFile(String(args.path ?? ""));
    case "list_dir":
      return b.listDir(String(args.path ?? ""));
    case "write_file":
      return b.writeFile(String(args.path ?? ""), String(args.content ?? ""));
    case "run_shell":
      return b.runShell(String(args.command ?? ""));
    case "screenshot": {
      const r = await b.screenshot();
      return { ok: r.ok, output: r.output, image: r.image };
    }
    case "mouse_move":
      return b.mouseMove(Number(args.x), Number(args.y));
    case "mouse_click":
      return b.mouseClick(Number(args.x), Number(args.y), args.button);
    case "type_text":
      return b.typeText(String(args.text ?? ""));
    case "key_press":
      return b.keyPress(String(args.key ?? ""));
    default:
      return { ok: false, output: `Unknown tool: ${name}` };
  }
}
