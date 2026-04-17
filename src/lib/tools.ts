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
      "Stealth Chromium automation (Playwright + stealth plugin). Persists multiple tabs across calls. Workflow: navigate → (wait_for) → click/fill via SMART selectors → get_text/screenshot. PREFER role+name, text, or label over CSS — much more robust. Use new_tab/switch_tab for multi-page tasks. Use download/upload for file operations. Call close when done.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "navigate", "back", "forward", "reload",
            "new_tab", "switch_tab", "list_tabs", "close_tab",
            "click", "click_selector", "fill", "press", "wait_for",
            "get_html", "get_text", "screenshot", "eval",
            "download", "upload",
            "close",
          ],
          description:
            "Navigation: navigate/back/forward/reload. Tabs: new_tab(url?)/list_tabs/switch_tab(index)/close_tab(index?). Interaction: click/fill/press/wait_for (use locator args). Read: get_html/get_text/screenshot/eval. Files: download (clicks loc that triggers download, saved to ~/Downloads/Oculo) / upload (sets file input). close=shut down browser.",
        },
        url: { type: "string", description: "Absolute http(s) URL. For navigate, new_tab(optional)." },
        // Smart selector — provide ONE of these (in order of preference):
        role: { type: "string", description: "ARIA role: 'button','link','textbox','heading','checkbox','combobox'... Pair with name." },
        name: { type: "string", description: "Accessible name to match with role (e.g. role='button', name='Submit')." },
        text: { type: "string", description: "Visible text content to match. Use for links/buttons with stable text." },
        label: { type: "string", description: "Form field label (the <label> text, e.g. 'Email')." },
        placeholder: { type: "string", description: "Input placeholder text." },
        testId: { type: "string", description: "data-testid attribute value." },
        selector: { type: "string", description: "CSS selector — last resort, brittle. Prefer role/text/label." },
        exact: { type: "boolean", description: "Exact text match (default false = substring/case-insensitive)." },
        // Action-specific:
        value: { type: "string", description: "Text to type. For action=fill." },
        key: { type: "string", description: "Key name (Enter, Tab, Escape, ArrowDown...). For action=press. Default Enter." },
        state: { type: "string", description: "wait_for state: visible|attached|hidden|detached. Default visible." },
        timeout: { type: "number", description: "Timeout ms. Default 15000." },
        fullPage: { type: "boolean", description: "Full-page screenshot. Default false." },
        expression: { type: "string", description: "JS expression for action=eval." },
        index: { type: "number", description: "Tab index for switch_tab/close_tab. 0-based." },
        file: { type: "string", description: "Single file path for upload. Must be in allowed paths." },
        files: { type: "array", items: { type: "string" }, description: "Multiple file paths for upload." },
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
  // ────────────── Phase 4: Deep system access (armed-mode required) ──────────────
  {
    name: "sudo_shell",
    risk: "high",
    description:
      "Run a shell command with elevated/root privileges. macOS uses Touch ID via osascript, Windows uses UAC/Hello, Linux uses pkexec — the OS prompts the user for biometric/password EVERY call (no caching). REQUIRES armed-mode. If user has not armed, you may explain WHY you need it via 'reason' and the app will prompt them. Use sparingly; prefer plain `bash` for non-privileged work.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run as root/admin." },
        reason: { type: "string", description: "1-line justification shown to the user if they need to arm first." },
      },
      required: ["command"],
    },
  },
  {
    name: "run_script",
    risk: "high",
    description:
      "Run a native scripting host: AppleScript (macOS, e.g. send Mail/Messages, control apps), PowerShell (Windows, e.g. Outlook COM, services), or raw bash. Choose 'language' based on platform. Powerful — can send emails, post messages, automate any GUI app. REQUIRES armed-mode. 30s timeout.",
    parameters: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["applescript", "powershell", "bash"],
          description: "applescript=macOS only; powershell=Windows only; bash=any.",
        },
        script: { type: "string", description: "Full script source. Multi-line OK." },
        reason: { type: "string", description: "1-line justification for armed-mode prompt." },
      },
      required: ["language", "script"],
    },
  },
  {
    name: "raw_file",
    risk: "high",
    description:
      "Read/write/list files ANYWHERE on disk, bypassing the normal allowed_paths whitelist. Hard-blocked paths (/System, /etc/sudoers, ~/.ssh/id_*, HKLM registry) remain forbidden. REQUIRES armed-mode. Prefer text_editor.* for paths inside allowed_paths — it works without arming.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["read", "write", "list_dir", "delete"],
          description: "read=return file contents; write=overwrite; list_dir=list entries; delete=rm file.",
        },
        path: { type: "string", description: "Absolute path." },
        content: { type: "string", description: "File contents for action=write." },
        reason: { type: "string", description: "1-line justification for armed-mode prompt." },
      },
      required: ["action", "path"],
    },
  },
  // ────────────── Phase 5: Multi-agent orchestration ──────────────
  {
    name: "spawn_agent",
    risk: "medium",
    description:
      "Fork an autonomous SUB-AGENT with its own context window and a tool subset to work on a sub-task in parallel. Use this to: (a) split a big task into 2–3 independent threads, (b) isolate a noisy investigation, (c) keep your main context lean. The sub-agent runs by itself (no user prompts) and returns a final answer string. Up to 3 sub-agents run concurrently — extras queue. Nested spawning is allowed up to depth 2. Tool subset: omit 'tools' to inherit the parent's full toolset; pass an explicit array (e.g. ['web_search','fetch_url']) for least-privilege.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Short label for the sub-agent shown in the UI tree (e.g. 'Hacker News scraper').",
        },
        goal: {
          type: "string",
          description: "Self-contained task description. The sub-agent only sees this — include all context it needs.",
        },
        tools: {
          type: "array",
          items: { type: "string" },
          description: "Optional whitelist of tool names the sub-agent may use. Omit to inherit parent's tools.",
        },
        model: {
          type: "string",
          description: "Optional override model (e.g. 'gpt-5-mini' for cheap/fast workers). Defaults to current model.",
        },
      },
      required: ["name", "goal"],
    },
  },
  {
    name: "send_to_agent",
    risk: "low",
    description:
      "Send a message to a DIRECT-CHILD sub-agent that you previously spawned. The text is auto-injected as a user-role message before the child's NEXT step (it does NOT interrupt its current tool call). Use this to: (a) deliver new info you discovered, (b) refine instructions, or (c) fully replace its goal via optional `new_goal`. Permission: only direct parent ↔ direct child — siblings cannot DM. Use list with no args via the Agents tab to find agent ids; the spawn_agent result also returned an id.",
    parameters: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Target sub-agent id (the value returned by spawn_agent, full uuid).",
        },
        message: {
          type: "string",
          description: "Free-form instruction or context to inject. Be concise; the child has limited context.",
        },
        new_goal: {
          type: "string",
          description: "OPTIONAL — overwrite the child's goal entirely. Use only when redirecting it to a different task.",
        },
      },
      required: ["agent_id", "message"],
    },
  },
  {
    name: "report_to_parent",
    risk: "low",
    description:
      "Sub-agent → parent progress report. Call this from inside a sub-agent to stream a brief status, partial finding, or blocker to your parent (the user's main agent or your spawning agent). The parent will see your report at the top of its NEXT step's context. Don't spam — use for milestones or when you need the parent to course-correct. Not available to the root agent (you have no parent).",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "1–3 sentence status update or partial result.",
        },
      },
      required: ["text"],
    },
  },
  // ────────────── Phase 7: sibling broadcast & shared scratchpad ──────────────
  {
    name: "broadcast_to_siblings",
    risk: "low",
    description:
      "Send a single message to ALL sibling agents that share your same direct parent. The orchestrator relays it: each sibling receives it as an inbox message (auto-injected before its next step) AND your shared parent receives a copy as a report so it has context. You do not receive your own broadcast. Use for: 'I found X, you can stop searching for it' or coordination updates that don't fit through scratchpad.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Message body (1–3 sentences). Will be prefixed with [BROADCAST from <your-name>]." },
      },
      required: ["text"],
    },
  },
  {
    name: "scratchpad_write",
    risk: "low",
    description:
      "Write a string value to the SHARED scratchpad your sibling agents (same direct parent) can read. Use this to publish partial results without spamming inbox messages — e.g. scratchpad_write({key:'hn_top_titles', value:'1. Foo\\n2. Bar'}). Limits: 10KB per value, 50 keys per scope. Overwrites if key exists. The parent agent can also read its children's scratchpads.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Identifier for the value. Use snake_case." },
        value: { type: "string", description: "String content (≤10KB). Stringify JSON yourself if needed." },
        scope: { type: "string", description: "OPTIONAL — agent id whose CHILDREN-scope you want to write to. Only valid if you are the direct parent of that agent. Omit to use your own sibling-group scope." },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "scratchpad_read",
    risk: "low",
    description:
      "Read from the shared scratchpad of your sibling group (same direct parent). Omit `key` to list all keys with previews. Provide `key` to fetch the full value. Parent agents can also read their children's scratchpad via `scope=<child_id>`.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "OPTIONAL — specific key to fetch. Omit to list all keys in the scope." },
        scope: { type: "string", description: "OPTIONAL — agent id whose CHILDREN-scope you want to read. Only valid if you are the direct parent. Omit to use your own sibling-group scope." },
      },
      required: [],
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
export const CHAT_MODE_TOOL_NAMES = new Set<string>(["text_editor", "fetch_url", "web_search", "browser", "spawn_agent", "send_to_agent", "report_to_parent", "broadcast_to_siblings", "scratchpad_write", "scratchpad_read"]);

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
  if (name === "fetch_url" || name === "web_search" || name === "spawn_agent" || name === "send_to_agent" || name === "report_to_parent" || name === "broadcast_to_siblings" || name === "scratchpad_write" || name === "scratchpad_read") return true;
  if (name === "browser") {
    const a = String(args.action ?? "");
    return [
      "navigate", "back", "forward", "reload",
      "new_tab", "switch_tab", "list_tabs", "close_tab",
      "get_html", "get_text", "screenshot", "wait_for", "close",
    ].includes(a);
  }
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
  if (name === "sudo_shell" || name === "run_script" || name === "raw_file") return "high";
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
  if (name === "browser") {
    const a = String(args.action ?? "");
    if ([
      "navigate", "back", "forward", "reload",
      "new_tab", "switch_tab", "list_tabs", "close_tab",
      "get_html", "get_text", "screenshot", "wait_for", "close", "eval",
    ].includes(a)) return "low";
    if (a === "upload" || a === "download") return "high"; // touches local FS
    return "medium"; // click/fill/press = remote site mutation
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
  if (name === "sudo_shell") {
    return { ok: false, output: `[mock] sudo $ ${args.command}\n(desktop only — would prompt biometric/password)` };
  }
  if (name === "run_script") {
    return { ok: false, output: `[mock] run_script(${args.language}) — desktop only.` };
  }
  if (name === "raw_file") {
    return { ok: false, output: `[mock] raw_file.${args.action} ${args.path} — desktop only.` };
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
