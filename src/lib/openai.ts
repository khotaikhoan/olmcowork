// Client streaming + tool-calling OpenAI qua edge function (giữ key server-side)
import { supabase } from "@/integrations/supabase/client";

export const OPENAI_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-5-mini",
  "gpt-5",
] as const;

export type OpenAIModel = typeof OPENAI_MODELS[number];

export interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface OpenAITool {
  type: "function";
  function: { name: string; description: string; parameters: any };
}

export interface ChatOnceResult {
  content: string;
  tool_calls: OpenAIToolCall[];
}

export interface StreamOpenAIOptions {
  model: string;
  messages: OpenAIMessage[];
  signal?: AbortSignal;
  onToken: (chunk: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

async function authedFetch(body: unknown, signal?: AbortSignal) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Chưa đăng nhập");
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-chat`;
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
    signal,
  });
}

export async function chatOnceOpenAI(
  model: string,
  messages: OpenAIMessage[],
  tools: OpenAITool[],
  signal?: AbortSignal,
): Promise<ChatOnceResult> {
  const res = await authedFetch({ model, messages, tools, stream: false }, signal);
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).error || ""; } catch {}
    throw new Error(`OpenAI ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  const json = await res.json();
  const msg = json.choices?.[0]?.message ?? {};
  return {
    content: typeof msg.content === "string" ? msg.content : "",
    tool_calls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
  };
}

export async function streamOpenAI(opts: StreamOpenAIOptions) {
  const { model, messages, signal, onToken, onDone, onError } = opts;
  try {
    const res = await authedFetch({ model, messages, stream: true }, signal);

    if (!res.ok || !res.body) {
      let detail = "";
      try {
        const j = await res.json();
        detail = j.error || JSON.stringify(j);
      } catch {
        try { detail = await res.text(); } catch {}
      }
      throw new Error(`OpenAI ${res.status}${detail ? `: ${detail}` : ""}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          onDone?.();
          return;
        }
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) onToken(delta);
        } catch {
          // ignore partial
        }
      }
    }
    onDone?.();
  } catch (e: any) {
    if (e.name === "AbortError") return;
    onError?.(e);
  }
}
