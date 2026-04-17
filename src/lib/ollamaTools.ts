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

  const body: any = { model, messages, stream: false };
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
      const retryBody = { model, messages, stream: false };
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
