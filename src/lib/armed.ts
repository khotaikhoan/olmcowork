// Armed-mode: 5-minute window where the agent can call deep-system tools
// (sudo, run_script, raw file ops). User-controlled. Auto-disarms on timeout
// or page unload. Keys mirror the fullAuto pattern.

const KEY = "chat.armed_until_ts"; // localStorage: epoch ms when armed expires
export const ARMED_DURATION_MS = 5 * 60 * 1000;

type Listener = (armedUntil: number | null) => void;
const listeners = new Set<Listener>();
let timer: number | null = null;

function readUntil(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return n;
  } catch {
    return null;
  }
}

function emit() {
  const v = readUntil();
  listeners.forEach((l) => l(v));
}

function ensureTimer() {
  if (timer != null) return;
  if (typeof window === "undefined") return;
  timer = window.setInterval(() => {
    const v = readUntil();
    emit();
    if (v == null && timer != null) {
      window.clearInterval(timer);
      timer = null;
    }
  }, 1000);
}

export function isArmed(): boolean {
  return readUntil() != null;
}

export function getArmedUntil(): number | null {
  return readUntil();
}

export function getArmedRemainingMs(): number {
  const v = readUntil();
  return v == null ? 0 : Math.max(0, v - Date.now());
}

export function arm(durationMs: number = ARMED_DURATION_MS) {
  try {
    localStorage.setItem(KEY, String(Date.now() + durationMs));
    ensureTimer();
    emit();
  } catch { /* ignore */ }
}

export function disarm() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  emit();
}

export function subscribeArmed(cb: Listener): () => void {
  listeners.add(cb);
  ensureTimer();
  cb(readUntil());
  return () => { listeners.delete(cb); };
}

/** Tools that require armed-mode to run. */
export const ARMED_REQUIRED_TOOLS = new Set<string>([
  "sudo_shell",
  "run_script",
  "raw_file",
]);

export function requiresArmed(toolName: string): boolean {
  return ARMED_REQUIRED_TOOLS.has(toolName);
}

/** Format mm:ss for countdown display. */
export function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}
