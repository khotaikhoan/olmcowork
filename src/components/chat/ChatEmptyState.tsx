import { useState } from "react";
import { MessageSquare, Monitor, ChevronDown, Lightbulb, ArrowRight, WifiOff } from "lucide-react";
import { OculoLogo } from "@/components/OculoLogo";
import { AGENT_PRESETS, AgentPreset } from "@/lib/presets";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ConversationMode } from "@/lib/tools";
import { isElectron } from "@/lib/bridge";

const LS_MSG_COUNT = "chat.user_message_count";
const LS_SHOW_SUGGESTIONS = "chat.empty_state_show_suggestions"; // "1" | "0"

interface Props {
  onPickPreset: (p: AgentPreset) => void;
  onPickPrompt: (prompt: string) => void;
  bridgeOnline: boolean;
  ollamaUrl: string;
  mode: ConversationMode;
  onModeChange: (m: ConversationMode) => void;
}

const SUGGESTIONS_BY_MODE: Record<ConversationMode, string[]> = {
  chat: [
    "Giải thích cách hoạt động của Transformer trong NLP",
    "Tóm tắt nội dung URL https://news.ycombinator.com",
    "Viết script Python in 10 số Fibonacci đầu tiên",
    "Sửa lỗi ngữ pháp đoạn văn tôi sắp gửi",
  ],
  control: [
    "Chụp màn hình rồi mô tả những gì bạn thấy",
    "Liệt kê các file trong ~/Desktop",
    "Mở Chrome và tìm 'electron security'",
    "Đọc file ~/notes.txt và tóm tắt",
  ],
};

export function ChatEmptyState({
  onPickPreset,
  onPickPrompt,
  bridgeOnline,
  ollamaUrl,
  mode,
  onModeChange,
}: Props) {
  const presets = AGENT_PRESETS.filter((p) =>
    mode === "control" ? p.toolsEnabled : !p.toolsEnabled,
  );
  const electron = isElectron();

  const messageCount = (() => {
    try {
      return parseInt(localStorage.getItem(LS_MSG_COUNT) || "0", 10) || 0;
    } catch {
      return 0;
    }
  })();
  const manualOverride = (() => {
    try {
      return localStorage.getItem(LS_SHOW_SUGGESTIONS);
    } catch {
      return null;
    }
  })();

  // Tối giản: mặc định ẩn gợi ý; chỉ mở nếu user đã bật trước đó.
  const initialShow = manualOverride === "1";
  const [showSuggestions, setShowSuggestions] = useState(initialShow);

  const toggleSuggestions = () => {
    const next = !showSuggestions;
    setShowSuggestions(next);
    try {
      localStorage.setItem(LS_SHOW_SUGGESTIONS, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col items-center text-center max-w-md mx-auto px-4 py-5 md:py-6 animate-fade-in transition-opacity duration-200 ease-out">
      {!bridgeOnline && (
        <Alert variant="destructive" className="mb-6 w-full text-left py-2.5 px-3 border-destructive/35 bg-destructive/[0.06]">
          <WifiOff className="h-4 w-4" />
          <AlertDescription className="text-xs leading-snug [&_p]:leading-snug">
            Không kết nối Ollama tại{" "}
            <code className="px-1 rounded bg-muted/80 font-mono text-[11px]">{ollamaUrl}</code>
            . Mở Cài đặt hoặc dùng OpenAI.
          </AlertDescription>
        </Alert>
      )}

      <div className="h-9 w-9 rounded-xl bg-[image:var(--gradient-primary)] flex items-center justify-center mb-3 shadow-[var(--shadow-soft)]">
        <OculoLogo size={22} withGradient={false} className="text-primary-foreground" />
      </div>

      <h2 className="text-xl md:text-2xl font-serif font-semibold tracking-tight text-foreground">
        Sẵn sàng trợ giúp bạn
      </h2>
      <p className="text-xs text-muted-foreground mt-1 mb-6">
        Chọn chế độ, nhập tin nhắn ở ô dưới cùng.
      </p>

      <div
        role="tablist"
        aria-label="Chọn chế độ"
        className="inline-flex w-full max-w-sm rounded-xl border border-border/80 bg-muted/30 p-0.5 mb-4 transition-colors duration-200"
      >
        <button
          role="tab"
          aria-selected={mode === "chat"}
          title="Trò chuyện thuần; đọc file/URL khi cần; không thao tác máy."
          onClick={() => onModeChange("chat")}
          className={
            "flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors duration-200 ease-out " +
            (mode === "chat"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          <MessageSquare className={"h-3.5 w-3.5 shrink-0 " + (mode === "chat" ? "text-primary" : "")} />
          Chat
        </button>
        <button
          role="tab"
          aria-selected={mode === "control"}
          title={
            electron
              ? "Điều khiển chuột, bàn phím, file, shell."
              : "Cần bản desktop để dùng Control."
          }
          onClick={() => onModeChange("control")}
          className={
            "flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors duration-200 ease-out " +
            (mode === "control"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          <Monitor className={"h-3.5 w-3.5 shrink-0 " + (mode === "control" ? "text-warning" : "")} />
          Control
          {!electron && (
            <span className="text-[9px] font-medium px-1 py-0 rounded bg-muted text-muted-foreground">
              app
            </span>
          )}
        </button>
      </div>

      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center mb-5 w-full">
          {presets.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPickPreset(p)}
                title={p.description}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground/90 hover:bg-accent/50 hover:border-primary/25 transition-colors duration-200 ease-out"
              >
                <Icon className="h-3 w-3 opacity-70" />
                {p.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="w-full border-t border-border/50 pt-4">
        {showSuggestions ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2">
              <span className="text-[11px] text-muted-foreground">Gợi ý</span>
              <button
                type="button"
                onClick={toggleSuggestions}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                Thu gọn
              </button>
            </div>
            <div className="grid gap-1.5">
              {SUGGESTIONS_BY_MODE[mode].map((s) => (
                <Button
                  key={s}
                  variant="ghost"
                  size="sm"
                  className="group h-auto min-h-0 justify-between py-2 px-2.5 text-left font-normal text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  onClick={() => onPickPrompt(s)}
                >
                  <span className="flex-1 min-w-0 text-left leading-snug">{s}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={toggleSuggestions}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
          >
            <Lightbulb className="h-3.5 w-3.5" />
            Gợi ý nhanh
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        )}
      </div>

      {messageCount >= 10 && !showSuggestions && (
        <p className="text-[10px] text-muted-foreground/70 mt-4 max-w-xs">
          Bạn đã gửi {messageCount} tin — gợi ý đang ẩn để gọn hơn.
        </p>
      )}
    </div>
  );
}
