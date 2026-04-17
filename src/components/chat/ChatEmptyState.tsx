import { useState } from "react";
import { MessageSquare, Monitor, Sparkles, ArrowRight, Lightbulb, ChevronDown } from "lucide-react";
import { OculoLogo } from "@/components/OculoLogo";
import { AGENT_PRESETS, AgentPreset } from "@/lib/presets";
import { Button } from "@/components/ui/button";
import type { ConversationMode } from "@/lib/tools";
import { isElectron } from "@/lib/bridge";

// Behavior-learning threshold: power users (≥ this many messages sent) see a
// collapsed suggestions block by default to reduce visual noise.
const POWER_USER_THRESHOLD = 10;
const LS_MSG_COUNT = "chat.user_message_count";
const LS_SHOW_SUGGESTIONS = "chat.empty_state_show_suggestions"; // "1" | "0" — manual override

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

  return (
    <div className="flex flex-col items-center text-center py-6 md:py-8 animate-fade-in max-w-3xl mx-auto px-4">
      {/* Compact hero — saves ~40% vertical space vs before */}
      <div className="h-12 w-12 rounded-2xl bg-[image:var(--gradient-primary)] flex items-center justify-center mb-3 shadow-[var(--shadow-elevated)]">
        <OculoLogo size={28} withGradient={false} className="text-primary-foreground" />
      </div>
      <h2 className="text-2xl md:text-3xl font-serif font-semibold mb-1 tracking-tight">
        Sẵn sàng trợ giúp bạn
      </h2>
      <p className="text-sm text-muted-foreground mb-5">
        Chọn chế độ phù hợp rồi bắt đầu trò chuyện.
      </p>

      {/* ── Mode picker — segmented control style, compact + clear ─────── */}
      <div
        role="tablist"
        aria-label="Chọn chế độ"
        className="inline-flex items-stretch rounded-2xl border border-border bg-card p-1 mb-5 shadow-[var(--shadow-soft)] w-full max-w-md"
      >
        <button
          role="tab"
          aria-selected={mode === "chat"}
          onClick={() => onModeChange("chat")}
          className={
            "flex-1 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 " +
            (mode === "chat"
              ? "bg-primary/10 text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50")
          }
        >
          <MessageSquare className={"h-4 w-4 " + (mode === "chat" ? "text-primary" : "")} />
          Chat
          <span className="hidden sm:inline text-[10px] font-normal text-muted-foreground/80 ml-0.5">
            · trò chuyện
          </span>
        </button>
        <button
          role="tab"
          aria-selected={mode === "control"}
          onClick={() => onModeChange("control")}
          className={
            "flex-1 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 " +
            (mode === "control"
              ? "bg-warning/10 text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50")
          }
          title={!electron ? "Cần ứng dụng desktop để dùng Control mode" : undefined}
        >
          <Monitor className={"h-4 w-4 " + (mode === "control" ? "text-warning" : "")} />
          Control
          <span className="hidden sm:inline text-[10px] font-normal text-muted-foreground/80 ml-0.5">
            · điều khiển máy
          </span>
          {!electron && (
            <span className="ml-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              desktop
            </span>
          )}
        </button>
      </div>

      {/* Mode tagline — tiny helper to clarify what each mode does */}
      <p className="text-xs text-muted-foreground mb-6 -mt-2 max-w-md">
        {mode === "chat"
          ? "Trò chuyện thuần như ChatGPT. Đọc file/URL khi cần. Không thao tác máy."
          : "AI điều khiển chuột, bàn phím, file, shell — như Claude Computer Use."}
      </p>

      {/* ── Agent presets — compact pill row ────────────────────────────── */}
      {presets.length > 0 && (
        <div className="w-full mb-5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            <Sparkles className="h-3 w-3" /> Preset
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {presets.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => onPickPreset(p)}
                  title={p.description}
                  className="group inline-flex items-center gap-2 rounded-full border border-border bg-card hover:bg-accent/40 hover:border-primary/40 transition-all px-3 py-1.5 text-sm shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-elevated)]"
                >
                  <Icon className="h-3.5 w-3.5 text-foreground/70 group-hover:text-primary transition-colors" />
                  <span className="font-medium">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Prompt suggestions ─────────────────────────────────────────── */}
      <div className="w-full">
        <div className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">
          Gợi ý cho {mode === "chat" ? "Chat" : "Control"}
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {SUGGESTIONS_BY_MODE[mode].map((s) => (
            <Button
              key={s}
              variant="outline"
              className="group justify-between h-auto py-2.5 text-sm font-normal text-left whitespace-normal hover:border-primary/40 hover:bg-accent/30 gap-2"
              onClick={() => onPickPrompt(s)}
            >
              <span className="flex-1 min-w-0 text-left">{s}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </Button>
          ))}
        </div>
      </div>

      {!bridgeOnline && (
        <p className="text-sm text-destructive mt-5 max-w-md">
          Không kết nối được Ollama tại{" "}
          <code className="px-1 bg-muted rounded">{ollamaUrl}</code>. Kiểm tra Cài đặt hoặc
          chuyển sang OpenAI.
        </p>
      )}
    </div>
  );
}
