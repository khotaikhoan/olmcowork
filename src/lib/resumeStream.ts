/**
 * Resume Stream — persist in-flight assistant streaming state to localStorage
 * so that if the tab is reloaded / network drops while streaming, the user can
 * choose to continue from where it stopped instead of losing the partial reply.
 *
 * Stored per conversationId. Cleared on successful completion or explicit stop.
 */

import type { PendingAttachment } from "@/components/chat/ChatInput";

export interface ResumeState {
  /** The user prompt that triggered this stream. */
  prompt: string;
  /** Lightweight attachments meta (we don't persist base64 to keep size sane). */
  attachmentsMeta: { name: string; size: number }[];
  /** Partial assistant text streamed so far. */
  partial: string;
  /** Provider used (so we don't try resume across providers). */
  provider: "ollama" | "openai";
  /** Model used. */
  model: string;
  /** When the stream started. */
  startedAt: number;
  /** When this state was last updated. */
  updatedAt: number;
  /** Whether tools were enabled (resume currently only supports plain streaming). */
  toolsEnabled: boolean;
}

const KEY_PREFIX = "chat.resume.v1.";
const MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h
const MIN_PARTIAL_CHARS = 40; // don't bother resuming tiny stubs

function key(conversationId: string) {
  return KEY_PREFIX + conversationId;
}

export function saveResumeState(conversationId: string, state: ResumeState): void {
  if (!conversationId) return;
  try {
    localStorage.setItem(key(conversationId), JSON.stringify({ ...state, updatedAt: Date.now() }));
  } catch {
    // quota — ignore silently
  }
}

export function loadResumeState(conversationId: string | null): ResumeState | null {
  if (!conversationId) return null;
  try {
    const raw = localStorage.getItem(key(conversationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeState;
    // Drop if stale or too small to be useful
    if (Date.now() - parsed.updatedAt > MAX_AGE_MS) {
      clearResumeState(conversationId);
      return null;
    }
    if ((parsed.partial?.length ?? 0) < MIN_PARTIAL_CHARS) {
      clearResumeState(conversationId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearResumeState(conversationId: string | null): void {
  if (!conversationId) return;
  try {
    localStorage.removeItem(key(conversationId));
  } catch {
    /* ignore */
  }
}

/** Build a continuation prompt that nudges the model to pick up where it left off. */
export function buildContinuationPrompt(state: ResumeState): string {
  const tail = state.partial.slice(-1200); // last ~1200 chars as anchor
  return [
    `[Yêu cầu gốc bị gián đoạn — tiếp tục câu trả lời]`,
    ``,
    `Yêu cầu ban đầu của tôi:`,
    state.prompt,
    ``,
    `Bạn đã trả lời được phần sau (kết thúc đột ngột do mất kết nối / reload):`,
    `"""`,
    tail,
    `"""`,
    ``,
    `Hãy TIẾP TỤC viết tiếp từ đúng chỗ đã dừng. KHÔNG chào lại, KHÔNG lặp lại đoạn đã có ở trên. Chỉ viết phần còn thiếu để hoàn chỉnh câu trả lời.`,
  ].join("\n");
}

/** Lightweight throttle helper for save calls. */
export function makeThrottledSaver(intervalMs = 800) {
  let last = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  return (fn: () => void) => {
    const now = Date.now();
    if (now - last >= intervalMs) {
      last = now;
      fn();
    } else if (!pending) {
      pending = setTimeout(() => {
        last = Date.now();
        pending = null;
        fn();
      }, intervalMs - (now - last));
    }
  };
}

/** Attachment meta extractor — used to display "had N attachments" on resume. */
export function attachmentsToMeta(attachments: PendingAttachment[]): { name: string; size: number }[] {
  return attachments.map((a) => ({ name: a.file.name, size: a.file.size }));
}
