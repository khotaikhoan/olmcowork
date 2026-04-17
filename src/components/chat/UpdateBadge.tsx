import { useUpdater } from "@/hooks/useUpdater";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
} from "lucide-react";

function fmtBytes(n: number): string {
  if (!n || n < 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

function fmtEta(bytesLeft: number, bps: number): string {
  if (!bps || bps <= 0 || !bytesLeft) return "—";
  const s = Math.round(bytesLeft / bps);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}m ${ss}s`;
}

export function UpdateBadge() {
  const { status, busy, check, install, available } = useUpdater();
  if (!available) return null;

  const v = status.currentVersion;
  const dl = status.state === "downloading" ? status : null;
  const pct = dl?.percent ?? 0;
  const bps = dl?.bytesPerSecond ?? 0;
  const transferred = dl?.transferred ?? 0;
  const total = dl?.total ?? 0;

  let icon = <Sparkles className="h-3 w-3" />;
  let label = v ? `v${v}` : "App";
  let tone = "bg-muted text-muted-foreground hover:bg-muted/80";
  let pulse = false;

  switch (status.state) {
    case "checking":
      icon = <Loader2 className="h-3 w-3 animate-spin" />;
      label = "Đang kiểm tra…";
      break;
    case "available":
      icon = <Download className="h-3 w-3" />;
      label = `Có bản ${status.version ?? "mới"}`;
      tone = "bg-primary/15 text-primary hover:bg-primary/25";
      pulse = true;
      break;
    case "downloading":
      icon = <Loader2 className="h-3 w-3 animate-spin" />;
      label = `Đang tải ${pct}%`;
      tone = "bg-primary/15 text-primary hover:bg-primary/25";
      break;
    case "ready":
      icon = <CheckCircle2 className="h-3 w-3" />;
      label = `Cài ${status.version ?? ""}`.trim();
      tone =
        "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.25)]";
      pulse = true;
      break;
    case "error":
      icon = <AlertTriangle className="h-3 w-3" />;
      label = "Lỗi update";
      tone = "bg-destructive/15 text-destructive hover:bg-destructive/25";
      break;
    default:
      break;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={
            "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors relative overflow-hidden " +
            tone +
            (pulse ? " animate-pulse" : "")
          }
          title="Trạng thái cập nhật"
        >
          {/* Inline progress fill bar (downloading state) */}
          {dl && (
            <span
              className="absolute inset-y-0 left-0 bg-primary/20 transition-[width]"
              style={{ width: `${pct}%` }}
              aria-hidden
            />
          )}
          <span className="relative flex items-center gap-1.5">
            {icon}
            <span className="font-mono">{label}</span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 space-y-3">
        <div>
          <div className="text-xs font-medium">Phiên bản hiện tại</div>
          <div className="font-mono text-sm">{v ? `v${v}` : "—"}</div>
        </div>

        {status.state === "available" && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              Đã phát hiện bản mới{" "}
              <span className="font-mono text-foreground">{status.version}</span>. Đang chuẩn bị tải xuống…
            </div>
            <Progress value={undefined as any} className="h-1.5 animate-pulse" />
          </div>
        )}

        {status.state === "downloading" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Đang tải bản{" "}
                <span className="font-mono text-foreground">{status.version ?? ""}</span>
              </span>
              <span className="font-mono tabular-nums text-foreground">{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" />
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-muted-foreground">
              <span>
                {fmtBytes(transferred)}
                {total > 0 && ` / ${fmtBytes(total)}`}
              </span>
              <span>
                {bps > 0 ? `${fmtBytes(bps)}/s` : ""}
                {total > 0 && bps > 0 && (
                  <span className="ml-2">· còn {fmtEta(total - transferred, bps)}</span>
                )}
              </span>
            </div>
          </div>
        )}

        {status.state === "ready" && (
          <>
            <div className="text-xs text-muted-foreground">
              Bản <span className="font-mono text-foreground">{status.version}</span> đã sẵn sàng. App sẽ khởi động lại để cài đặt.
            </div>
            <Button size="sm" className="w-full" onClick={install}>
              <Download className="h-3.5 w-3.5 mr-1" />
              Cài & khởi động lại
            </Button>
          </>
        )}

        {status.state === "error" && (
          <div className="text-xs text-destructive break-words">
            {(status as any).message ?? "Không rõ lỗi"}
          </div>
        )}

        {status.state === "disabled" && (
          <div className="text-xs text-muted-foreground">
            Auto-update chỉ chạy trên bản đóng gói (.dmg/.exe). Đang chạy ở chế độ dev.
          </div>
        )}

        {status.state === "none" && (
          <div className="text-xs text-muted-foreground">
            Bạn đang dùng bản mới nhất.
          </div>
        )}

        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={check}
          disabled={busy || status.state === "checking" || status.state === "downloading"}
        >
          <RefreshCw className={"h-3.5 w-3.5 mr-1 " + (busy || status.state === "checking" ? "animate-spin" : "")} />
          Kiểm tra cập nhật
        </Button>
      </PopoverContent>
    </Popover>
  );
}
