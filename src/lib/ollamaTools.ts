// Extended Ollama client with tool calling support (non-streaming for tool steps).

export interface OllamaToolCall {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, any>;
  };
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

export interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

export interface ChatResponse {
  content: string;
  tool_calls: OllamaToolCall[];
}

// Cache các model đã biết là không hỗ trợ tools, để lần sau khỏi gửi lại
const modelsWithoutToolSupport = new Set<string>();

function extractError(txt: string): string {
  try {
    const j = JSON.parse(txt);
    return j.error || txt;
  } catch {
    return txt;
  }
}

export function modelSupportsTools(model: string): boolean {
  return !modelsWithoutToolSupport.has(model);
}

export async function chatOnce(
  baseUrl: string,
  model: string,
  messages: OllamaChatMessage[],
  tools: OllamaTool[] | undefined,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/chat`;
  const useTools = !!(tools && tools.length) && !modelsWithoutToolSupport.has(model);

  // Làm sạch messages: chỉ gửi field thật sự có giá trị, ép content luôn là string,
  // tránh runner Ollama crash do field rỗng/null lạ.
  const sanitized = messages.map((m) => {
    const out: any = {
      role: m.role,
      content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
    };
    if (m.images && m.images.length) out.images = m.images;
    if (m.tool_calls && m.tool_calls.length) out.tool_calls = m.tool_calls;
    if (m.tool_name) out.tool_name = m.tool_name;
    return out;
  });

  // Vision/screenshot tokens >> text — bump ctx when any message carries an image.
  const hasImages = sanitized.some((m: any) => Array.isArray(m.images) && m.images.length);
  const num_ctx = hasImages ? 16384 : 4096;
  const body: any = { model, messages: sanitized, stream: false, options: { num_ctx } };
  if (useTools) body.tools = tools;

  let res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  // Nếu model không hỗ trợ tools → ghi nhớ và retry không kèm tools
  if (!res.ok && useTools) {
    const txt = await res.text();
    const errMsg = extractError(txt);
    if (res.status === 400 && /does not support tools/i.test(errMsg)) {
      modelsWithoutToolSupport.add(model);
      const retryBody = { model, messages: sanitized, stream: false, options: { num_ctx } };
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retryBody),
        signal,
      });
      if (!res.ok) {
        throw new Error(`Ollama ${res.status}: ${extractError(await res.text())}`);
      }
    } else {
      throw new Error(`Ollama ${res.status}: ${errMsg}`);
    }
  } else if (!res.ok) {
    throw new Error(`Ollama ${res.status}: ${extractError(await res.text())}`);
  }

  const data = await res.json();
  const msg = data.message ?? {};
  return {
    content: msg.content ?? "",
    tool_calls: (msg.tool_calls ?? []) as OllamaToolCall[],
  };
}
