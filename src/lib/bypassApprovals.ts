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

export function getBypass(convId: string | null): boolean {
  if (!convId) return false;
  return readMap()[convId] === true;
}

export function setBypass(convId: string, v: boolean) {
  const m = readMap();
  if (v) m[convId] = true;
  else delete m[convId];
  writeMap(m);
  listeners.forEach((fn) => fn(convId, v));
}

export function subscribeBypass(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
