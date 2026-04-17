/**
 * Heuristic "Why?" extractor — picks 1-2 sentences from an assistant message that
 * best explain why a given tool call was issued.
 *
 * We strip <think>…</think> and code fences, split into sentences, then prefer
 * sentences that mention the tool name, action, or a key arg (path/url/query).
 * Falls back to the last 1-2 sentences if no keyword match is found.
 */

import type { ToolCallRecord } from "@/components/chat/ToolCallCard";

const MAX_SENTENCES = 2;
const MAX_CHARS = 280;

function stripNoise(text: string): string {
  return text
    // remove think blocks
    .replace(/<think>[\s\S]*?<\/think>/gi, " ")
    // remove fenced code blocks
    .replace(/```[\s\S]*?```/g, " ")
    // remove inline code
    .replace(/`[^`]*`/g, " ")
    // collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text: string): string[] {
  if (!text) return [];
  // Split on . ! ? followed by space + capital/quote, plus newline boundaries.
  // Vietnamese diacritics are preserved by `\p{L}` with the `u` flag.
  const parts = text
    .split(/(?<=[.!?])\s+(?=["'(\p{Lu}\p{L}])/u)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text.trim()].filter(Boolean);
}

function keywordsForCall(call: ToolCallRecord): string[] {
  const kws = new Set<string>();
  const a = String(call.args.action ?? "").toLowerCase();
  if (call.name) kws.add(call.name.toLowerCase());
  if (a) kws.add(a);
  // Friendly synonyms (Vietnamese + English)
  if (call.name === "bash") ["bash", "shell", "terminal", "lệnh", "chạy"].forEach((k) => kws.add(k));
  if (call.name === "fetch_url") ["fetch", "url", "trang", "tải", "lấy"].forEach((k) => kws.add(k));
  if (call.name === "web_search") ["search", "tìm", "tra cứu", "google"].forEach((k) => kws.add(k));
  if (call.name === "text_editor") {
    ["file", "tệp", "đọc", "sửa", "tạo", "edit", "create", "view"].forEach((k) => kws.add(k));
    if (a === "view") ["xem", "đọc"].forEach((k) => kws.add(k));
    if (a === "create") ["tạo", "viết"].forEach((k) => kws.add(k));
    if (a === "str_replace") ["sửa", "thay", "đổi", "patch"].forEach((k) => kws.add(k));
  }
  if (call.name === "computer") {
    ["click", "type", "screenshot", "chụp", "gõ", "nhấn", "di chuột"].forEach((k) => kws.add(k));
  }
  if (call.name === "vision_click") {
    ["click", "annotate", "phần tử", "nhãn", "vision"].forEach((k) => kws.add(k));
  }
  // Specific arg values — path basename, hostname, query
  const path = String(call.args.path ?? "");
  if (path) {
    const base = path.split(/[/\\]/).pop();
    if (base) kws.add(base.toLowerCase());
  }
  const url = String(call.args.url ?? "");
  if (url) {
    try { kws.add(new URL(url).hostname.toLowerCase()); } catch { /* ignore */ }
  }
  const query = String(call.args.query ?? "");
  if (query) {
    query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .forEach((w) => kws.add(w));
  }
  return Array.from(kws);
}

/**
 * Returns the best 1-2 sentence explanation, or null when nothing useful
 * can be extracted (empty / pure code message).
 */
export function explainWhy(precedingText: string | undefined, call: ToolCallRecord): string | null {
  const cleaned = stripNoise(precedingText ?? "");
  if (!cleaned) return null;
  const sentences = splitSentences(cleaned);
  if (sentences.length === 0) return null;

  const kws = keywordsForCall(call);
  // Score sentences (later sentences win ties — they're typically the "I will now do X" line)
  const scored = sentences.map((s, i) => {
    const lower = s.toLowerCase();
    let score = 0;
    for (const k of kws) {
      if (k.length >= 2 && lower.includes(k)) score += 2;
    }
    // recency bonus
    score += i / sentences.length;
    return { s, score, i };
  });

  const matched = scored.filter((x) => x.score >= 2).sort((a, b) => b.score - a.score);
  let pick: typeof scored;
  if (matched.length > 0) {
    // Take up to MAX_SENTENCES around the top match, in original order
    const top = matched.slice(0, MAX_SENTENCES).sort((a, b) => a.i - b.i);
    pick = top;
  } else {
    // Fallback: last MAX_SENTENCES sentences
    pick = scored.slice(-MAX_SENTENCES);
  }

  let out = pick.map((x) => x.s).join(" ").trim();
  if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS - 1).trimEnd() + "…";
  return out || null;
}
