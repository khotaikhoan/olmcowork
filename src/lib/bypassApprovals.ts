/**
 * Bypass Approvals — per-conversation flag để auto-approve TẤT CẢ tool calls
 * (kể cả high-risk + armed-mode tools).
 *
 * NGUY HIỂM: dùng khi tin tưởng prompt và cần chạy nhanh không bị gián đoạn.
 * - Per-conversation: mỗi conv có flag riêng, không ảnh hưởng conv khác.
 * - Auto-arm: khi bypass bật, tự động arm để khỏi popup ArmRequestDialog.
 * - Persist: lưu localStorage để giữ qua reload, nhưng reset khi user tắt.
 */

const KEY = "chat.bypassApprovals";

type Listener = (convId: string, v: boolean) => void;
const listeners = new Set<Listener>();

function readMap(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function writeMap(m: Record<string, boolean>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

const DEFAULT_KEY = "chat.bypassApprovals.default";

/** Global default: when ON, every new conversation entering control mode auto-bypasses. */
export function getBypassDefault(): boolean {
  try {
    return localStorage.getItem(DEFAULT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setBypassDefault(v: boolean) {
  try {
    localStorage.setItem(DEFAULT_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function getBypass(convId: string | null): boolean {
  if (!convId) return false;
  const m = readMap();
  if (convId in m) return m[convId] === true;
  // Fall back to global default for conversations that haven't been touched.
  return getBypassDefault();
}

export function setBypass(convId: string, v: boolean) {
  const m = readMap();
  // Always store explicit value so per-conv choice overrides the global default.
  m[convId] = v;
  writeMap(m);
  listeners.forEach((fn) => fn(convId, v));
}

export function subscribeBypass(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
