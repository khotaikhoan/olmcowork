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
      "Low-level computer control: mouse move/click at pixel coords, type text, press keys, raw screenshot. FALLBACK ONLY — prefer observe_screen + vision_click for clicking UI controls (more accurate). Use computer.* for: typing into a focused field, hotkeys (cmd+s, ctrl+c), or clicking pixel locations no AX mark covers (canvas, image, custom widget).",
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
    name: "observe_screen",
    risk: "low",
    description:
      "PRIMARY 'eyes' for Control mode. Captures a screenshot of the frontmost app AND enumerates clickable controls via OS accessibility tree (macOS AX / Windows UIA). Returns: (1) base64 screenshot for vision reasoning, (2) numbered marks list with {id, role, label, bounds} so you can click precisely with vision_click. CALL THIS BEFORE every UI action to verify state. Cheaper and more accurate than computer.screenshot + pixel guessing.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "vision_click",
    risk: "high",
    description:
      "PREFERRED click method. Click an accessibility-detected control by its mark_id from the most recent observe_screen call. action='annotate' re-enumerates controls if observe_screen is stale; action='click' clicks mark_id. Use this instead of computer.left_click whenever a mark exists for the target — it is pixel-exact and survives window movement.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["annotate", "click"],
          description: "annotate=enumerate AX/UIA controls of frontmost app; click=click a previously-annotated mark.",
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
    name: "fetch_url",
    risk: "low",
    description:
      "Fetch a public web page and return its title, description, and a short text snippet. Read-only HTTP GET via a server-side proxy — safe in both Chat and Control modes. Use this when you need to look up information from a URL the user shared or that you need to research.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute http(s) URL to fetch." },
      },
      required: ["url"],
    },
  },
  {
    name: "web_search",
    risk: "low",
    description:
      "Search the web (DuckDuckGo) and return a list of results with title, url, and snippet. Read-only — safe in Chat and Control modes. Use this to find pages relevant to a question, then optionally call fetch_url on a promising result to read its content.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query." },
        limit: {
          type: "number",
          description: "Max number of results to return (1-10, default 5).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "browser",
    risk: "medium",
    description:
      "Headless Chromium browser automation (Playwright). Persists 1 page across calls. Use for: web scraping, form filling, login flows, multi-step web tasks. Always navigate first, then click_selector/fill/press, then get_html/get_text/screenshot to observe. CSS selectors only (no XPath). Close when done.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "navigate",
            "click_selector",
            "fill",
            "press",
            "get_html",
            "get_text",
            "screenshot",
            "wait_for",
            "eval",
            "close",
          ],
          description:
            "navigate=goto URL; click_selector=click CSS selector; fill=type into input; press=keyboard key (Enter, Tab…); get_html/get_text=read page or selector; screenshot=PNG of page; wait_for=wait for selector to appear; eval=run JS expression; close=shut down browser.",
        },
        url: { type: "string", description: "Absolute http(s) URL. Required for action=navigate." },
        selector: {
          type: "string",
          description:
            "CSS selector (e.g. 'input[name=q]', '#submit', '.btn-primary'). Required for click_selector/fill/wait_for; optional for press/get_html/get_text.",
        },
        value: { type: "string", description: "Text to type. Required for action=fill." },
        key: { type: "string", description: "Key name (e.g. 'Enter', 'Tab'). Default: Enter. For action=press." },
        timeout: { type: "number", description: "Timeout ms for wait_for. Default 15000." },
        fullPage: { type: "boolean", description: "Full-page screenshot. Default false." },
        expression: {
          type: "string",
          description: "JS expression evaluated in page context. For action=eval. Returns JSON-stringified result.",
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

/**
 * Conversation modes:
 *  - "chat": pure conversation, optionally read-only inspection (text_editor.view/list_dir).
 *           No mouse/keyboard/bash/file mutation. Safe in browser.
 *  - "control": full computer-use suite (computer, vision_click, bash, text_editor mutations).
 *           Requires Electron desktop bridge.
 */
export type ConversationMode = "chat" | "control";

/** Names of tools allowed in Chat mode (read-only inspection only). */
export const CHAT_MODE_TOOL_NAMES = new Set<string>(["text_editor", "fetch_url", "web_search"]);

/**
 * Filter the tool registry by mode. In chat mode we still expose `text_editor`
 * but downstream callers (executeTool) must reject any non-view actions.
 */
export function toolsForMode(mode: ConversationMode): ToolDef[] {
  if (mode === "control") return TOOLS;
  // Chat mode: only read-only text_editor (view + list_dir). We narrow the
  // schema to make that explicit to the model.
  return TOOLS.filter((t) => CHAT_MODE_TOOL_NAMES.has(t.name)).map((t) => {
    if (t.name !== "text_editor") return t;
    return {
      ...t,
      description:
        "Read-only file inspection. Use 'view' to read a file or 'list_dir' to list a directory. Mutations are disabled in chat mode.",
      parameters: {
        ...t.parameters,
        properties: {
          ...t.parameters.properties,
          action: {
            type: "string",
            enum: ["view", "list_dir"],
            description: "view=read file; list_dir=list directory entries.",
          },
        },
        required: ["action", "path"],
      },
    };
  });
}

/** True if a given (tool, action) is permitted in the given mode. */
export function isActionAllowedInMode(
  mode: ConversationMode,
  name: string,
  args: Record<string, any>,
): boolean {
  if (mode === "control") return true;
  if (name === "fetch_url" || name === "web_search") return true;
  if (name !== "text_editor") return false;
  const a = String(args.action ?? "");
  return a === "view" || a === "list_dir";
}

/** OpenAI/Ollama "function" tool format. */
export function toOllamaTools(mode: ConversationMode = "control") {
  return toolsForMode(mode).map((t) => ({
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
    if (a === "annotate") return "low";
    return "high";
  }
  if (name === "observe_screen") return "low";
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
