/**
 * Full Auto mode — agent chạy tối đa N bước, KHÔNG hỏi xác nhận tool.
 * Esc để huỷ ngay (handled in ChatView via abortRef).
 *
 * State lưu trong localStorage để toggle nhanh, không cần migration DB.
 * Subscribe pattern để các component (Settings toggle, ChatView, badge) sync realtime.
 */

const KEY = "chat.fullAuto";
type Listener = (v: boolean) => void;
const listeners = new Set<Listener>();

export function getFullAuto(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setFullAuto(v: boolean) {
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(v));
}

export function subscribeFullAuto(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Số bước tối đa cho 1 lần "send" trong Full Auto mode. */
export const FULL_AUTO_MAX_STEPS = 20;
/** Mức max steps cũ (giữ cho non-full-auto). */
export const NORMAL_MAX_STEPS = 8;
