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

// Detect: chạy trong Electron desktop app hay browser thường?
function isElectronEnv(): boolean {
  return typeof window !== "undefined" && !!(window as any).bridge?.isElectron;
}

// Detect: trang đang ở HTTPS nhưng cố gọi HTTP localhost? (mixed content sẽ chặn)
function isMixedContentBlocked(baseUrl: string): boolean {
  if (typeof window === "undefined") return false;
  const isHttpsPage = window.location.protocol === "https:";
  const isHttpTarget = baseUrl.startsWith("http://");
  return isHttpsPage && isHttpTarget && !isElectronEnv();
}

function ollamaErrorHint(baseUrl: string): string {
  if (isMixedContentBlocked(baseUrl)) {
    return "Bạn đang xem ở web preview (HTTPS) nên trình duyệt chặn gọi http://localhost:11434 (mixed content). Hãy build & dùng Desktop app, hoặc chuyển Provider sang OpenAI trong Settings.";
  }
  if (!isElectronEnv()) {
    return "Trình duyệt không gọi được Ollama do CORS. Chạy lại Ollama với OLLAMA_ORIGINS=* hoặc dùng Desktop app.";
  }
  return `Không kết nối được Ollama tại ${baseUrl}. Kiểm tra Ollama đã chạy chưa (ollama serve).`;
}

export async function listModels(baseUrl: string): Promise<OllamaModel[]> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
    if (!res.ok) throw new Error(`Ollama responded ${res.status}`);
    const data = await res.json();
    return data.models ?? [];
  } catch (e: any) {
    if (e?.message?.startsWith("Ollama responded")) throw e;
    throw new Error(ollamaErrorHint(baseUrl));
  }
}

export async function pingOllama(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Trả về lý do cụ thể tại sao không kết nối được Ollama (để hiện banner). */
export function getOllamaUnreachableReason(baseUrl: string): string {
  return ollamaErrorHint(baseUrl);
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

/** Fetch model details (incl. real context_length) via /api/show. Returns null on failure. */
export async function showModel(
  baseUrl: string,
  name: string,
): Promise<{ contextLength: number | null; family: string | null } | null> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Ollama exposes architecture-specific keys like "llama.context_length",
    // "qwen2.context_length", etc. Find the first *.context_length entry.
    const info = data.model_info ?? {};
    let ctx: number | null = null;
    for (const k of Object.keys(info)) {
      if (k.endsWith(".context_length") && typeof info[k] === "number") {
        ctx = info[k];
        break;
      }
    }
    return {
      contextLength: ctx,
      family: data.details?.family ?? null,
    };
  } catch {
    return null;
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
    const hasImages = sanitized.some((m: any) => Array.isArray(m.images) && m.images.length);
    const num_ctx = hasImages ? 16384 : 4096;
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: sanitized, stream: true, options: { num_ctx } }),
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
