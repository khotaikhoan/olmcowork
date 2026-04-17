// Tool registry — Anthropic Computer Use spec (computer_20241022, bash_20241022, text_editor_20241022).
// Mỗi tool nhận một `action` con + tham số tương ứng. Bridge sẽ dispatch xuống native handler.

export type RiskLevel = "low" | "medium" | "high";

export interface ToolDef {
  name: string;
  /** Anthropic-style type, nếu nào model claude-native sẽ map thẳng */
  anthropic_type?: "computer_20241022" | "bash_20241022" | "text_editor_20241022";
  description: string;
  risk: RiskLevel;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
}

export const TOOLS: ToolDef[] = [
  {
    name: "computer",
    anthropic_type: "computer_20241022",
    risk: "high",
    description:
      "Control the user's computer: capture screen, move/click mouse, type text, press keys. Always call screenshot first to see what's on screen.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "screenshot",
            "mouse_move",
            "left_click",
            "right_click",
            "middle_click",
            "double_click",
            "type",
            "key",
          ],
          description:
            "Which sub-action to perform. screenshot has no other args; mouse_* needs coordinate; type needs text; key needs key.",
        },
        coordinate: {
          type: "array",
          items: { type: "number" },
          description: "[x, y] in absolute screen pixels. Required for mouse_* actions.",
        },
        text: { type: "string", description: "Text to type. Required for action=type." },
        key: {
          type: "string",
          description: "Key name (e.g. 'Enter', 'Escape', 'cmd+c'). Required for action=key.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "vision_click",
    risk: "high",
    description:
      "Vision-guided click using Set-of-Marks. Captures the screen, auto-detects clickable UI elements, overlays numbered marks, then YOU pick a mark by number. The app clicks the center of that mark. Use action='annotate' to get the marked screenshot first (returns image + list of marks with their bounds), then action='click' with mark_id to perform the click.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["annotate", "click"],
          description: "annotate=capture+mark elements; click=click a previously-annotated mark.",
        },
        mark_id: {
          type: "number",
          description: "The number of the mark to click (1-based). Required for action=click.",
        },
        button: {
          type: "string",
          enum: ["left", "right", "middle"],
          description: "Mouse button. Default: left.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "bash",
    anthropic_type: "bash_20241022",
    risk: "high",
    description: "Run a bash command on the user's machine. 30s timeout, 5MB output cap.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute." },
      },
      required: ["command"],
    },
  },
  {
    name: "text_editor",
    anthropic_type: "text_editor_20241022",
    risk: "medium",
    description:
      "View, create, or edit text files. Use 'view' to read, 'create' to overwrite, 'str_replace' to patch.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["view", "create", "str_replace", "list_dir"],
          description:
            "view=read file; create=write/overwrite; str_replace=replace exact string in file; list_dir=list directory entries.",
        },
        path: { type: "string", description: "Absolute file or directory path." },
        file_text: { type: "string", description: "New file contents. Required for action=create." },
        old_str: {
          type: "string",
          description: "Exact text to find. Required for action=str_replace. Must match exactly once.",
        },
        new_str: { type: "string", description: "Replacement text. Required for action=str_replace." },
      },
      required: ["action", "path"],
    },
  },
];

export const TOOLS_BY_NAME: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

/** OpenAI/Ollama "function" tool format. */
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

/** Risk classification for a specific tool invocation (action-aware). */
export function effectiveRisk(name: string, args: Record<string, any>): RiskLevel {
  if (name === "text_editor") {
    const a = String(args.action ?? "");
    if (a === "view" || a === "list_dir") return "low";
    return "high"; // create/str_replace mutate files
  }
  if (name === "computer") {
    const a = String(args.action ?? "");
    if (a === "screenshot") return "medium";
    return "high"; // any input action
  }
  if (name === "vision_click") {
    const a = String(args.action ?? "");
    if (a === "annotate") return "medium";
    return "high";
  }
  return TOOLS_BY_NAME[name]?.risk ?? "high";
}

// ----- Mock executor (browser fallback) -----
const mockFs: Record<string, string> = {
  "/home/user/notes.txt": "Mock note file.\nLine 2.\nLine 3.",
  "/home/user/todo.md": "# Todo\n- [x] Build chat UI\n- [ ] Add tool calling\n- [ ] Wrap Electron",
};

export interface ExecResult {
  ok: boolean;
  output: string;
  /** base64 PNG, set by computer.screenshot */
  image?: string;
}

export async function mockExecute(
  name: string,
  args: Record<string, any>,
): Promise<ExecResult> {
  await new Promise((r) => setTimeout(r, 250 + Math.random() * 400));
  if (name === "bash") {
    return {
      ok: true,
      output: `[mock] $ ${args.command}\n(stdout) command executed successfully\n(exit 0)`,
    };
  }
  if (name === "text_editor") {
    const action = String(args.action ?? "");
    const p = String(args.path ?? "");
    if (action === "view") {
      if (mockFs[p]) return { ok: true, output: mockFs[p] };
      return { ok: false, output: `[mock] No such file: ${p}` };
    }
    if (action === "list_dir") {
      return {
        ok: true,
        output: `[mock] ${p}\nDocuments/\nDownloads/\nDesktop/\nnotes.txt\ntodo.md`,
      };
    }
    if (action === "create") {
      mockFs[p] = String(args.file_text ?? "");
      return { ok: true, output: `[mock] Wrote ${(args.file_text ?? "").length} bytes to ${p}` };
    }
    if (action === "str_replace") {
      const cur = mockFs[p];
      if (!cur) return { ok: false, output: `[mock] No such file: ${p}` };
      const next = cur.replace(String(args.old_str ?? ""), String(args.new_str ?? ""));
      mockFs[p] = next;
      return { ok: true, output: `[mock] Replaced in ${p}` };
    }
  }
  if (name === "computer") {
    const action = String(args.action ?? "");
    if (action === "screenshot") {
      return {
        ok: true,
        output: "[mock] Screenshot captured (1920x1080). In Electron this returns a base64 PNG.",
      };
    }
    return { ok: true, output: `[mock] computer.${action} ${JSON.stringify(args)}` };
  }
  return { ok: false, output: `[mock] Unknown tool: ${name}` };
}
