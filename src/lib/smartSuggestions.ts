import type { ToolCallRecord } from "@/components/chat/ToolCallCard";

export interface Suggestion {
  label: string;
  prompt: string;
  icon?: string;
}

export interface SuggestionContext {
  lastUserMessage?: string;
  mode?: "chat" | "control";
  provider?: "ollama" | "openai";
  bridgeOnline?: boolean;
  model?: string;
}

/**
 * Generate 3 context-aware next-step suggestions based on the AI's last reply
 * and the tool calls it made. Heuristic / pattern-based — instant & free.
 */
export function generateSuggestions(
  content: string,
  toolCalls: ToolCallRecord[] | null | undefined,
  ctx?: SuggestionContext,
): Suggestion[] {
  const calls = toolCalls ?? [];
  const text = (content || "").toLowerCase();
  const lastUser = (ctx?.lastUserMessage || "").trim();
  const mode = ctx?.mode;

  const summarizeUserIntent = () => {
    if (!lastUser) return "";
    const cleaned = lastUser
      .replace(/\s+/g, " ")
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .trim();
    if (cleaned.length <= 80) return cleaned;
    return cleaned.slice(0, 77) + "…";
  };

  // ----- File creation / edit context -----
  const fileCalls = calls.filter(
    (c) => c.name === "text_editor" || c.name === "create" || c.name === "str_replace",
  );
  const createdFile = fileCalls.find((c) => {
    const a = (c.args?.action as string) || "";
    return a === "create" || a === "write";
  });
  const editedFile = fileCalls.find((c) => {
    const a = (c.args?.action as string) || "";
    return a === "str_replace" || a === "edit" || a === "insert";
  });

  if (createdFile || editedFile) {
    const path = (createdFile?.args?.path || editedFile?.args?.path || "file") as string;
    const isTest = /\.(test|spec)\.[tj]sx?$/.test(path);
    if (isTest) {
      return [
        { label: "Chạy test", prompt: `Chạy test file ${path} và báo kết quả`, icon: "play" },
        { label: "Thêm edge cases", prompt: `Thêm edge cases và error handling vào ${path}`, icon: "plus" },
        { label: "Cải thiện coverage", prompt: `Phân tích coverage của ${path} và bổ sung test còn thiếu`, icon: "shield" },
      ];
    }
    return [
      { label: "Test thử", prompt: `Test thử ${path} xem có lỗi gì không`, icon: "play" },
      { label: "Refactor", prompt: `Refactor ${path} cho gọn và dễ đọc hơn, giữ nguyên behaviour`, icon: "wand" },
      { label: "Thêm test", prompt: `Viết unit test cho ${path}`, icon: "flask" },
    ];
  }

  // ----- Bash / command execution -----
  const bashCall = calls.find((c) => c.name === "bash");
  if (bashCall) {
    const failed = bashCall.status === "error";
    if (failed) {
      return [
        { label: "Fix lỗi", prompt: "Phân tích lỗi vừa xảy ra và sửa giúp tôi", icon: "wrench" },
        { label: "Giải thích lỗi", prompt: "Giải thích chi tiết lỗi vừa rồi và nguyên nhân gốc", icon: "info" },
        { label: "Thử cách khác", prompt: "Có cách khác để làm việc này không? Đề xuất 2-3 phương án", icon: "shuffle" },
      ];
    }
    return [
      { label: "Bước tiếp theo", prompt: "Tiếp tục bước tiếp theo", icon: "arrow" },
      { label: "Kiểm tra kết quả", prompt: "Verify kết quả vừa rồi đã đúng chưa", icon: "check" },
      { label: "Tối ưu", prompt: "Có cách nào tối ưu hoặc làm nhanh hơn không?", icon: "zap" },
    ];
  }

  // ----- Web search / fetch_url context -----
  const searched = calls.find((c) => c.name === "web_search" || c.name === "fetch_url");
  if (searched) {
    return [
      { label: "Tóm tắt", prompt: "Tóm tắt lại những điểm chính từ kết quả vừa rồi", icon: "list" },
      { label: "Đào sâu hơn", prompt: "Đào sâu hơn vào nguồn đáng tin cậy nhất ở trên", icon: "search" },
      { label: "So sánh", prompt: "So sánh các quan điểm/nguồn khác nhau ở trên", icon: "compare" },
    ];
  }

  // ----- Screenshot / vision context -----
  const visionCall = calls.find(
    (c) => c.name === "computer" && (c.args?.action === "screenshot" || c.args?.action === "annotate"),
  );
  if (visionCall) {
    return [
      { label: "Click vào…", prompt: "Click vào element được đánh dấu phù hợp nhất", icon: "click" },
      { label: "Mô tả thêm", prompt: "Mô tả chi tiết hơn những gì bạn thấy trên màn hình", icon: "eye" },
      { label: "Chụp lại", prompt: "Chụp lại màn hình và kiểm tra trạng thái hiện tại", icon: "camera" },
    ];
  }

  // ----- Code in reply (no tool calls) -----
  const hasCode = /```[a-z]/i.test(content);
  if (hasCode) {
    return [
      { label: "Áp dụng code", prompt: "Áp dụng code này vào dự án giúp tôi", icon: "code" },
      { label: "Giải thích", prompt: "Giải thích từng phần của code trên", icon: "info" },
      { label: "Cải tiến", prompt: "Có thể cải tiến code trên thế nào? Đưa version tốt hơn", icon: "wand" },
    ];
  }

  // ----- Question / explanation reply -----
  if (text.includes("?") || /^(bạn|cách|làm|tại sao|vì sao|how|why|what)/i.test(content)) {
    return [
      { label: "Cho ví dụ", prompt: "Cho tôi 1-2 ví dụ cụ thể", icon: "lightbulb" },
      { label: "Đào sâu", prompt: "Giải thích sâu hơn phần này", icon: "search" },
      { label: "Tóm tắt ngắn", prompt: "Tóm tắt lại trong 3 gạch đầu dòng", icon: "list" },
    ];
  }

  // ----- Default fallback -----
  // If we know the user's last message, tailor the generic buttons to the current intent.
  const intent = summarizeUserIntent();
  if (intent) {
    if (mode === "control") {
      return [
        { label: "Tiếp tục thực thi", prompt: `Tiếp tục thực thi yêu cầu này và trả về kết quả: ${intent}`, icon: "play" },
        { label: "Bạn đang ở bước nào?", prompt: `Bạn đang ở bước nào của task này: ${intent}? Mô tả trạng thái hiện tại rồi làm tiếp.`, icon: "eye" },
        { label: "Nếu bị kẹt", prompt: `Nếu đang bị kẹt khi thực thi: ${intent}, hãy nói rõ lỗi/điểm kẹt và đề xuất cách xử lý rồi tiếp tục.`, icon: "wrench" },
      ];
    }
    return [
      { label: "Trả lời đúng mục tiêu", prompt: `Trả lời đúng mục tiêu theo yêu cầu này: ${intent}`, icon: "arrow" },
      { label: "Tóm tắt kết quả", prompt: `Tóm tắt kết quả cho yêu cầu này: ${intent} trong 3-5 gạch đầu dòng`, icon: "list" },
      { label: "Làm rõ 1 điểm", prompt: `Dựa trên yêu cầu này: ${intent}, hãy hỏi tôi 1 câu để làm rõ giả định quan trọng nhất (nếu cần), rồi đề xuất hướng làm.`, icon: "info" },
    ];
  }
  return [
    { label: "Tiếp tục", prompt: "Tiếp tục", icon: "arrow" },
    { label: "Giải thích thêm", prompt: "Giải thích chi tiết hơn", icon: "info" },
    { label: "Cho ví dụ", prompt: "Cho 1 ví dụ minh hoạ", icon: "lightbulb" },
  ];
}
