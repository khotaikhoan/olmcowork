import { Play, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResumeState } from "@/lib/resumeStream";

interface Props {
  state: ResumeState;
  onResume: () => void;
  onDismiss: () => void;
}

function relativeTime(ts: number): string {
  const diffSec = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s trước`;
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min} phút trước`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.round(h / 24)} ngày trước`;
}

export function ResumeBanner({ state, onResume, onDismiss }: Props) {
  const preview = state.partial.slice(-220).replace(/\s+/g, " ").trim();
  const charCount = state.partial.length;
  return (
    <div className="my-3 rounded-2xl border border-warning/40 bg-warning/5 p-3 animate-fade-in">
      <div className="flex items-start gap-2">
        <div className="h-8 w-8 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
          <RefreshCw className="h-4 w-4 text-warning" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">Câu trả lời trước bị gián đoạn</span>
            <span className="text-[10px] text-muted-foreground">
              · {relativeTime(state.updatedAt)} · {charCount.toLocaleString()} ký tự
            </span>
          </div>
          <p className="text-xs text-muted-foreground italic line-clamp-2">
            …{preview}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="default"
              className="h-7 text-xs"
              onClick={onResume}
            >
              <Play className="h-3 w-3 mr-1" />
              Tiếp tục từ chỗ dở
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={onDismiss}
            >
              <X className="h-3 w-3 mr-1" />
              Bỏ qua
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
