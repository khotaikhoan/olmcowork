import { Bot, MessageSquare, Monitor } from "lucide-react";
import { AGENT_PRESETS, AgentPreset } from "@/lib/presets";
import { Button } from "@/components/ui/button";
import type { ConversationMode } from "@/lib/tools";
import { isElectron } from "@/lib/bridge";

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
    "Giải thích cho tôi cách hoạt động của Transformer trong NLP",
    "Tóm tắt nội dung URL https://news.ycombinator.com",
    "Viết script Python in ra 10 số Fibonacci đầu tiên",
    "Sửa lỗi ngữ pháp đoạn văn tôi sắp gửi",
  ],
  control: [
    "Chụp màn hình rồi mô tả những gì bạn thấy",
    "Liệt kê các file trong ~/Desktop",
    "Mở Chrome và tìm kiếm 'electron security'",
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
  // In chat mode, only show non-tool presets; in control mode show tool presets.
  const presets = AGENT_PRESETS.filter((p) =>
    mode === "control" ? p.toolsEnabled : !p.toolsEnabled,
  );
  const electron = isElectron();

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 animate-fade-in max-w-3xl mx-auto">
      <div className="h-16 w-16 rounded-2xl bg-[image:var(--gradient-primary)] flex items-center justify-center mb-5 shadow-[var(--shadow-elevated)]">
        <Bot className="h-8 w-8 text-primary-foreground" />
      </div>
      <h2 className="text-3xl font-serif font-semibold mb-2 tracking-tight">
        Sẵn sàng trợ giúp bạn
      </h2>
      <p className="text-muted-foreground max-w-md mb-6">
        Chọn chế độ trước, rồi gõ câu hỏi hoặc chọn preset.
      </p>

      {/* Mode picker — large, prominent */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-xl mb-8">
        <button
          onClick={() => onModeChange("chat")}
          className={
            "rounded-2xl border p-5 text-left transition-all duration-200 " +
            (mode === "chat"
              ? "border-primary/60 bg-primary/5 shadow-[var(--shadow-elevated)]"
              : "border-border bg-card hover:border-primary/40 hover:-translate-y-0.5")
          }
        >
          <div className="flex items-center gap-2 mb-1.5">
            <MessageSquare className="h-4 w-4 text-primary" />
            <div className="font-medium text-sm">Chat</div>
            {mode === "chat" && (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-primary">
                Đang chọn
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Trò chuyện thuần như ChatGPT. Đọc file/URL khi cần. Không thao tác máy.
          </div>
        </button>
        <button
          onClick={() => onModeChange("control")}
          className={
            "rounded-2xl border p-5 text-left transition-all duration-200 " +
            (mode === "control"
              ? "border-warning/60 bg-[hsl(var(--warning)/0.08)] shadow-[var(--shadow-elevated)]"
              : "border-border bg-card hover:border-warning/40 hover:-translate-y-0.5")
          }
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Monitor className="h-4 w-4 text-warning" />
            <div className="font-medium text-sm">Control</div>
            {mode === "control" && (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-warning">
                Đang chọn
              </span>
            )}
            {!electron && (
              <span className="ml-auto text-[10px] font-medium text-muted-foreground">
                Cần desktop
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Điều khiển máy: chuột, bàn phím, file, shell. Như Claude Computer Use.
          </div>
        </button>
      </div>

      {/* Agent presets filtered by mode */}
      {presets.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full mb-8">
          {presets.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() => onPickPreset(p)}
                className="group rounded-2xl border border-border bg-card hover:bg-accent/40 hover:border-primary/40 transition-all text-left p-4 shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5 duration-200"
              >
                <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center mb-3 group-hover:bg-primary/10 transition-colors">
                  <Icon className="h-4 w-4 text-foreground/70 group-hover:text-primary transition-colors" />
                </div>
                <div className="font-medium text-sm mb-0.5">{p.name}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Prompt suggestions */}
      <div className="w-full">
        <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
          Gợi ý cho chế độ {mode === "chat" ? "Chat" : "Control"}
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {SUGGESTIONS_BY_MODE[mode].map((s) => (
            <Button
              key={s}
              variant="outline"
              className="justify-start h-auto py-2.5 text-sm font-normal text-left whitespace-normal hover:border-primary/40 hover:bg-accent/30"
              onClick={() => onPickPrompt(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {!bridgeOnline && (
        <p className="text-sm text-destructive mt-6 max-w-md">
          Không kết nối được Ollama tại{" "}
          <code className="px-1 bg-muted rounded">{ollamaUrl}</code>. Kiểm tra Cài đặt hoặc
          chuyển sang OpenAI.
        </p>
      )}
    </div>
  );
}
