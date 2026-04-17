// Client streaming OpenAI qua edge function (giữ key server-side)
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

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface StreamOpenAIOptions {
  model: string;
  messages: OpenAIMessage[];
  signal?: AbortSignal;
  onToken: (chunk: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

export async function streamOpenAI(opts: StreamOpenAIOptions) {
  const { model, messages, signal, onToken, onDone, onError } = opts;
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Chưa đăng nhập");

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openai-chat`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ model, messages }),
      signal,
    });

    if (!res.ok || !res.body) {
      let detail = "";
      try {
        const j = await res.json();
        detail = j.error || JSON.stringify(j);
      } catch {
        try {
          detail = await res.text();
        } catch {}
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
