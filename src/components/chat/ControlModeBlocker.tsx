import { Download, Monitor, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onSwitchToChat: () => void;
}

const RELEASES_URL = "https://github.com/khotaikhoan/olmcowork/releases/latest";

/**
 * Replaces ChatInput when the user is in Control mode but running in a normal
 * browser (no Electron bridge). Computer-use tools cannot work without the
 * native bridge, so we hard-block input and prompt to download the desktop app.
 */
export function ControlModeBlocker({ onSwitchToChat }: Props) {
  const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  const isWin = typeof navigator !== "undefined" && /win/i.test(navigator.platform);
  const platformLabel = isMac ? "macOS" : isWin ? "Windows" : "Linux";

  return (
    <div className="border-t border-border bg-[hsl(var(--warning)/0.06)] px-4 py-5">
      <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-[hsl(var(--warning)/0.18)] flex items-center justify-center shrink-0">
          <Monitor className="h-5 w-5 text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm mb-0.5">Cần desktop app để dùng Control mode</div>
          <p className="text-xs text-muted-foreground">
            Trình duyệt web không thể điều khiển chuột, bàn phím, file hay shell trên máy bạn.
            Tải bản dành cho {platformLabel} để bật toàn bộ công cụ thật, hoặc chuyển về Chat
            mode để tiếp tục trò chuyện ngay.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={onSwitchToChat}
            className="flex-1 sm:flex-none"
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Về Chat
          </Button>
          <Button asChild size="sm" className="flex-1 sm:flex-none">
            <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Tải desktop app
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
