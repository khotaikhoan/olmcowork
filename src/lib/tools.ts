// Tool registry + mock executor for Phase 2.
// In Phase 3 (Electron), executors are replaced with real bridge IPC calls.

export type RiskLevel = "low" | "medium" | "high";

export interface ToolDef {
  name: string;
  description: string;
  risk: RiskLevel;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export const TOOLS: ToolDef[] = [
  {
    name: "read_file",
    description: "Read the contents of a file from the local filesystem.",
    risk: "low",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
      },
      required: ["path"],
    },
  },
  {
    name: "list_dir",
    description: "List entries (files and folders) in a directory.",
    risk: "low",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the directory" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write or overwrite a text file at the given path.",
    risk: "high",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file" },
        content: { type: "string", description: "Full file contents to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "run_shell",
    description: "Execute a shell command and return stdout/stderr.",
    risk: "high",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run" },
      },
      required: ["command"],
    },
  },
  {
    name: "screenshot",
    description: "Capture the user's primary screen and return image info.",
    risk: "medium",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

export const TOOLS_BY_NAME: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

// Ollama tool calling format
export function toOllamaTools() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// ----- Mock executor (Phase 2). Replace with Electron bridge in Phase 3. -----
const mockFs: Record<string, string> = {
  "/home/user/notes.txt": "Mock note file.\nLine 2.\nLine 3.",
  "/home/user/todo.md": "# Todo\n- [x] Build chat UI\n- [ ] Add tool calling\n- [ ] Wrap Electron",
};

export interface ExecResult {
  ok: boolean;
  output: string;
}

export async function mockExecute(
  name: string,
  args: Record<string, any>,
): Promise<ExecResult> {
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
  switch (name) {
    case "read_file": {
      const p = String(args.path ?? "");
      if (mockFs[p]) return { ok: true, output: mockFs[p] };
      return { ok: false, output: `[mock] No such file: ${p}` };
    }
    case "list_dir": {
      const p = String(args.path ?? "/");
      const entries = [
        "Documents/",
        "Downloads/",
        "Desktop/",
        "notes.txt",
        "todo.md",
      ];
      return { ok: true, output: `[mock] ${p}\n` + entries.join("\n") };
    }
    case "write_file": {
      const p = String(args.path ?? "");
      const c = String(args.content ?? "");
      mockFs[p] = c;
      return { ok: true, output: `[mock] Wrote ${c.length} bytes to ${p}` };
    }
    case "run_shell": {
      const cmd = String(args.command ?? "");
      return {
        ok: true,
        output: `[mock] $ ${cmd}\n(stdout) command executed successfully\n(exit 0)`,
      };
    }
    case "screenshot": {
      return {
        ok: true,
        output: "[mock] Screenshot captured (1920x1080). In Electron this returns a base64 image.",
      };
    }
    default:
      return { ok: false, output: `[mock] Unknown tool: ${name}` };
  }
}
