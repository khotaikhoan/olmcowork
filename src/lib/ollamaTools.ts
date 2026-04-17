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

export async function chatOnce(
  baseUrl: string,
  model: string,
  messages: OllamaChatMessage[],
  tools: OllamaTool[] | undefined,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const body: any = { model, messages, stream: false };
  if (tools && tools.length) body.tools = tools;

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const msg = data.message ?? {};
  return {
    content: msg.content ?? "",
    tool_calls: (msg.tool_calls ?? []) as OllamaToolCall[],
  };
}
