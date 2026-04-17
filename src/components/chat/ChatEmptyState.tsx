import { Bot } from "lucide-react";
import { AGENT_PRESETS, AgentPreset } from "@/lib/presets";
import { Button } from "@/components/ui/button";

interface Props {
  onPickPreset: (p: AgentPreset) => void;
  onPickPrompt: (prompt: string) => void;
  bridgeOnline: boolean;
  ollamaUrl: string;
}

const SUGGESTIONS = [
  "Tóm tắt nội dung file ~/Desktop/notes.txt",
  "Chụp màn hình rồi mô tả những gì bạn thấy",
  "Liệt kê các process Ollama đang chạy",
  "Viết script Python in ra 10 số Fibonacci đầu tiên",
];

export function ChatEmptyState({ onPickPreset, onPickPrompt, bridgeOnline, ollamaUrl }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 animate-fade-in max-w-3xl mx-auto">
      <div className="h-16 w-16 rounded-2xl bg-[image:var(--gradient-primary)] flex items-center justify-center mb-5 shadow-[var(--shadow-elevated)]">
        <Bot className="h-8 w-8 text-primary-foreground" />
      </div>
      <h2 className="text-3xl font-serif font-semibold mb-2 tracking-tight">
        Sẵn sàng trợ giúp bạn
      </h2>
      <p className="text-muted-foreground max-w-md mb-8">
        Chọn một preset, gõ câu hỏi, hoặc nhấn{" "}
        <kbd className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted border border-border">
          ⌘K
        </kbd>{" "}
        để mở Command Palette.
      </p>

      {/* Agent presets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full mb-8">
        {AGENT_PRESETS.map((p) => {
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

      {/* Prompt suggestions */}
      <div className="w-full">
        <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
          Gợi ý
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {SUGGESTIONS.map((s) => (
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
