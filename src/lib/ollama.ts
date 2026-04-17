// Ollama client - direct fetch to user's local Ollama instance.
// Requires OLLAMA_ORIGINS=* when running in browser. Inside Electron CORS is bypassed.

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  details?: { family?: string; parameter_size?: string };
}

export interface OllamaChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[]; // base64 (no data: prefix)
}

export async function listModels(baseUrl: string): Promise<OllamaModel[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
  if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
  const data = await res.json();
  return data.models ?? [];
}

export async function pingOllama(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export interface RunningModel {
  name: string;
  model: string;
  size: number;       // total bytes
  size_vram: number;  // bytes loaded into VRAM (0 = pure CPU)
  expires_at?: string;
}

export async function listRunning(baseUrl: string): Promise<RunningModel[]> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/ps`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.models ?? [];
  } catch {
    return [];
  }
}

export function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export interface StreamOptions {
  baseUrl: string;
  model: string;
  messages: OllamaChatMessage[];
  signal?: AbortSignal;
  onToken: (chunk: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

export async function streamChat(opts: StreamOptions) {
  const { baseUrl, model, messages, signal, onToken, onDone, onError } = opts;
  try {
    // Làm sạch payload: ép content thành string, bỏ field rỗng để tránh runner Ollama crash
    const sanitized = messages.map((m) => {
      const out: any = {
        role: m.role,
        content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
      };
      if (m.images && m.images.length) out.images = m.images;
      return out;
    });
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: sanitized, stream: true, options: { num_ctx: 2048 } }),
      signal,
    });
    if (!res.ok || !res.body) {
      let detail = "";
      try {
        const txt = await res.text();
        try {
          const j = JSON.parse(txt);
          detail = j.error || txt;
        } catch {
          detail = txt;
        }
      } catch {}
      throw new Error(`Ollama ${res.status}${detail ? `: ${detail}` : ""}`);
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
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed);
          if (json.message?.content) onToken(json.message.content);
          if (json.done) onDone?.();
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

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      // strip data:...;base64,
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
