import { MessageSquare, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ConversationMode } from "@/lib/tools";
import { isElectron } from "@/lib/bridge";

interface Props {
  value: ConversationMode;
  onChange: (m: ConversationMode) => void;
  disabled?: boolean;
}

export function ModeToggle({ value, onChange, disabled }: Props) {
  const electron = isElectron();
  return (
    <TooltipProvider delayDuration={200}>
      <div
        role="tablist"
        aria-label="Chế độ hội thoại"
        className="inline-flex items-center rounded-md border border-border bg-muted/40 p-0.5 shrink-0"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              role="tab"
              aria-selected={value === "chat"}
              disabled={disabled}
              onClick={() => onChange("chat")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 h-7 rounded text-xs font-medium transition-colors",
                value === "chat"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <MessageSquare className="h-3.5 w-3.5" /> <span className="hidden md:inline">Chat</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Chỉ trò chuyện — không thao tác máy.</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              role="tab"
              aria-selected={value === "control"}
              disabled={disabled}
              onClick={() => onChange("control")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 h-7 rounded text-xs font-medium transition-colors",
                value === "control"
                  ? "bg-[hsl(var(--warning)/0.18)] text-warning shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                !electron && "opacity-70",
              )}
            >
              <Monitor className="h-3.5 w-3.5" /> Control
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {electron
              ? "Điều khiển máy thật: chuột, bàn phím, file, shell."
              : "Cần chạy desktop app để dùng thật. Trên web sẽ giả lập."}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
