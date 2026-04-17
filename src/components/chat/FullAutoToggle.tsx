import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Zap, AlertTriangle } from "lucide-react";
import {
  getFullAuto,
  setFullAuto,
  subscribeFullAuto,
  FULL_AUTO_MAX_STEPS,
} from "@/lib/fullAuto";

/**
 * Toggle "Full Auto" trong Settings. Khi BẬT:
 *   • Agent loop chạy tối đa 20 bước, bỏ qua hết approval dialog.
 *   • Vẫn có thể nhấn Esc để dừng giữa chừng.
 */
export function FullAutoToggle() {
  const [on, setOn] = useState(getFullAuto());

  useEffect(() => subscribeFullAuto(setOn), []);

  return (
    <div
      className={
        "rounded-md border p-3 transition-colors " +
        (on ? "border-primary bg-primary/5" : "border-border")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Label className="flex items-center gap-1.5">
            <Zap
              className={
                "h-4 w-4 " + (on ? "text-primary fill-primary/30" : "text-muted-foreground")
              }
            />
            Full Auto (chạy tự động không hỏi)
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            Agent tự lên kế hoạch → thực thi → quan sát → điều chỉnh, tối đa{" "}
            {FULL_AUTO_MAX_STEPS} bước. Nhấn{" "}
            <kbd className="px-1 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">
              Esc
            </kbd>{" "}
            để dừng ngay.
          </p>
        </div>
        <Switch checked={on} onCheckedChange={setFullAuto} />
      </div>
      {on && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 px-2 py-1.5 text-[11px] text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            AI có thể chạy lệnh nguy hiểm mà không cần bạn duyệt. Chỉ bật khi
            bạn tin tưởng prompt và nhiệm vụ.
          </span>
        </div>
      )}
    </div>
  );
}
