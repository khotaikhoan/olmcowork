// Sandboxed JS/TS runner using a Web Worker with a 5s timeout.
// Returns captured console logs + return value (or error).
export interface RunResult {
  ok: boolean;
  logs: { level: "log" | "warn" | "error" | "info"; args: any[] }[];
  result?: any;
  error?: string;
  durationMs: number;
}

const WORKER_SRC = `
self.onmessage = async (e) => {
  const { code } = e.data;
  const logs = [];
  const cap = (level) => (...args) => {
    logs.push({ level, args: args.map((a) => {
      try { return typeof a === "object" ? JSON.parse(JSON.stringify(a)) : a; }
      catch { return String(a); }
    }) });
  };
  const console = { log: cap("log"), warn: cap("warn"), error: cap("error"), info: cap("info") };
  const start = performance.now();
  try {
    const fn = new Function("console", "return (async () => { " + code + " })()");
    const result = await fn(console);
    self.postMessage({ ok: true, logs, result, durationMs: performance.now() - start });
  } catch (err) {
    self.postMessage({ ok: false, logs, error: String(err && err.message || err), durationMs: performance.now() - start });
  }
};
`;

export async function runJs(code: string, timeoutMs = 5000): Promise<RunResult> {
  const blob = new Blob([WORKER_SRC], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const w = new Worker(url);
  return new Promise<RunResult>((resolve) => {
    const timer = setTimeout(() => {
      w.terminate();
      URL.revokeObjectURL(url);
      resolve({ ok: false, logs: [], error: `Timeout sau ${timeoutMs}ms`, durationMs: timeoutMs });
    }, timeoutMs);
    w.onmessage = (e) => {
      clearTimeout(timer);
      w.terminate();
      URL.revokeObjectURL(url);
      resolve(e.data as RunResult);
    };
    w.onerror = (e) => {
      clearTimeout(timer);
      w.terminate();
      URL.revokeObjectURL(url);
      resolve({ ok: false, logs: [], error: e.message || "Worker error", durationMs: 0 });
    };
    w.postMessage({ code });
  });
}
