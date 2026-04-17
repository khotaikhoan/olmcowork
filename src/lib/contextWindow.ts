/**
 * Phase A — Context window management.
 *
 * Two responsibilities:
 *  1. Sliding window — keep only the last N messages before sending to the LLM.
 *     Chat mode keeps more turns (light payloads); Control mode keeps fewer
 *     (tool outputs are heavy: screenshots, bash logs, observation DOM).
 *  2. Tool-output compression — drop base64 image payloads in old assistant
 *     turns and head/tail-truncate giant text outputs (bash, file reads).
 *
 * Designed to be pure / framework-free so it can be unit-tested and reused
 * by sub-agents later.
 */
import type { ConversationMode } from "@/lib/tools";
import type { OllamaChatMessage } from "@/lib/ollama";

export interface SlidingWindowConfig {
  /** Hard cap on user/assistant turns kept verbatim (system msg always kept). */
  maxMessages: number;
  /** Per-message text cap; longer outputs get head+tail truncated. */
  maxCharsPerMessage: number;
}

export const WINDOW_CHAT: SlidingWindowConfig = {
  maxMessages: 20,
  maxCharsPerMessage: 8_000,
};

export const WINDOW_CONTROL: SlidingWindowConfig = {
  maxMessages: 10,
  maxCharsPerMessage: 4_000,
};

export function getWindowConfig(mode: ConversationMode): SlidingWindowConfig {
  return mode === "control" ? WINDOW_CONTROL : WINDOW_CHAT;
}

/**
 * Head+tail truncate a long string so the model still sees both ends.
 * Returns the original string when under the cap.
 */
export function truncateMiddle(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  const keep = Math.floor((maxChars - 40) / 2);
  if (keep <= 0) return text.slice(0, maxChars);
  const head = text.slice(0, keep);
  const tail = text.slice(-keep);
  const cut = text.length - head.length - tail.length;
  return `${head}\n\n[... đã cắt ${cut.toLocaleString()} ký tự ...]\n\n${tail}`;
}

/**
 * Apply sliding window + per-message compression to a full chat history.
 *
 * - System message at index 0 (if present) is always preserved.
 * - Only the last `maxMessages` non-system turns are kept.
 * - For non-current (older) turns:
 *     · Drop base64 `images` arrays (vision payloads ~50–100k tokens each)
 *     · Truncate `content` head+tail
 * - The most recent turn is left intact so the model sees fresh tool output
 *   and the user's current question in full.
 *
 * Returns the compressed history plus stats for UI display.
 */
export interface CompressionStats {
  totalIn: number;
  totalOut: number;
  droppedMessages: number;
  truncatedMessages: number;
  droppedImageCount: number;
}

export function applyContextWindow(
  history: OllamaChatMessage[],
  cfg: SlidingWindowConfig,
): { history: OllamaChatMessage[]; stats: CompressionStats } {
  const stats: CompressionStats = {
    totalIn: history.length,
    totalOut: history.length,
    droppedMessages: 0,
    truncatedMessages: 0,
    droppedImageCount: 0,
  };

  if (history.length === 0) return { history, stats };

  // Separate system prefix (always kept) from the rest.
  const systemMsgs: OllamaChatMessage[] = [];
  const rest: OllamaChatMessage[] = [];
  for (const m of history) {
    if (m.role === "system" && rest.length === 0) systemMsgs.push(m);
    else rest.push(m);
  }

  // Sliding window — keep last N.
  let kept = rest;
  if (rest.length > cfg.maxMessages) {
    kept = rest.slice(-cfg.maxMessages);
    stats.droppedMessages = rest.length - kept.length;
  }

  // Compress all kept messages EXCEPT the last one (which is the user's
  // current prompt or the latest tool reply — must stay pristine).
  const lastIdx = kept.length - 1;
  const compressed = kept.map((m, i) => {
    if (i === lastIdx) return m;
    let changed = false;
    const out: OllamaChatMessage = { ...m };
    if (out.images && out.images.length > 0) {
      stats.droppedImageCount += out.images.length;
      delete out.images;
      changed = true;
    }
    if (out.content && out.content.length > cfg.maxCharsPerMessage) {
      out.content = truncateMiddle(out.content, cfg.maxCharsPerMessage);
      changed = true;
    }
    if (changed) stats.truncatedMessages += 1;
    return out;
  });

  const finalHistory = [...systemMsgs, ...compressed];
  stats.totalOut = finalHistory.length;
  return { history: finalHistory, stats };
}
