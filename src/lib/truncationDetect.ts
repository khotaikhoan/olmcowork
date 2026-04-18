/**
 * Truncation Detection — heuristic to decide whether an assistant reply looks
 * like it was cut off mid-thought (max_tokens hit, user hit Stop, network drop
 * during a non-stream tool loop, etc.). When true, the UI shows a
 * "Continue generating" button at the end of the bubble.
 */

const SENTENCE_TERMINATORS = /[.!?。！？…)\]"'`>}\s]$/;
const LIST_LINE = /^\s*[-*+\d.)]\s/m;

export interface TruncationInfo {
  truncated: boolean;
  reason?:
    | "unclosed-code-fence"
    | "unclosed-html-tag"
    | "missing-terminator"
    | "ends-mid-list"
    | "ends-mid-word";
}

export function detectTruncation(content: string): TruncationInfo {
  const text = (content || "").trim();
  if (!text) return { truncated: false };
  // Very short replies — likely intentional (e.g. "OK", "Done")
  if (text.length < 80) return { truncated: false };

  // 1) Unclosed triple-backtick code fence
  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) {
    return { truncated: true, reason: "unclosed-code-fence" };
  }

  // 2) Unclosed HTML / JSX-style tag in last 200 chars
  const tail = text.slice(-200);
  const openTags = (tail.match(/<[a-zA-Z][^>/]*$/) || []).length;
  if (openTags > 0) {
    return { truncated: true, reason: "unclosed-html-tag" };
  }

  // 3) Ends mid-word (last char is a letter and previous is too — but the
  // overall line has no terminator). Only flag if the line is long enough.
  const lastLine = text.split("\n").pop() || "";
  if (lastLine.length > 40 && !SENTENCE_TERMINATORS.test(lastLine)) {
    // Check if it's mid-list (starts with bullet but ends abruptly)
    if (LIST_LINE.test(lastLine)) {
      return { truncated: true, reason: "ends-mid-list" };
    }
    // Check if it ends mid-word (no whitespace at end, ends with letter)
    if (/[a-zA-ZÀ-ỹ]$/.test(lastLine) && !/\s/.test(lastLine.slice(-1))) {
      return { truncated: true, reason: "ends-mid-word" };
    }
    return { truncated: true, reason: "missing-terminator" };
  }

  return { truncated: false };
}

/** Build a prompt asking the model to continue from the last reply. */
export function buildContinuePrompt(previousReply: string): string {
  // Use the last ~1500 chars as anchor — enough context to know where to pick up
  // but not so much that we waste tokens.
  const tail = previousReply.slice(-1500);
  return [
    `[Tiếp tục câu trả lời trước]`,
    ``,
    `Câu trả lời của bạn ở turn trước bị cắt ngang. Đây là phần cuối:`,
    `"""`,
    tail,
    `"""`,
    ``,
    `Hãy viết tiếp NGAY từ đúng chỗ đã dừng. KHÔNG chào lại, KHÔNG tóm tắt, KHÔNG lặp lại đoạn đã có ở trên. Chỉ output phần còn thiếu để hoàn chỉnh câu trả lời.`,
  ].join("\n");
}
