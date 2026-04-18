import { Wrench, ShieldOff, Minimize2, Maximize2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isElectron } from "@/lib/bridge";
import { toolsForMode } from "@/lib/tools";

interface ControlBarProps {
  toolsEnabled: boolean;
  onToolsEnabledChange: (v: boolean) => void;
  bypass: boolean;
  onBypassChange: (v: boolean) => void;
  requireConfirm: boolean;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
}

const TOOL_COUNT = toolsForMode("control").length;

function statusText(toolsEnabled: boolean, bypass: boolean, requireConfirm: boolean) {
  if (!toolsEnabled) return "Bật để cho phép AI yêu cầu công cụ";
  if (bypass) return "Bypass: tự duyệt mọi lệnh";
  if (requireConfirm) return "Xác nhận trước khi chạy";
  return "Tự chạy mức thấp/trung bình";
}

/**
 * Compact pill — fits inside TopBar. Click to open a popover with all controls.
 * Status is communicated via icon color + a small dot indicating bypass.
 */
export function ControlBarCompact(props: ControlBarProps) {
  const {
    toolsEnabled,
    onToolsEnabledChange,
    bypass,
    onBypassChange,
    requireConfirm,
    onCollapsedChange,
  } = props;

  const tone = !toolsEnabled
    ? "bg-muted text-muted-foreground hover:bg-muted/80"
    : bypass
      ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
      : "bg-[hsl(var(--warning)/0.18)] text-warning hover:bg-[hsl(var(--warning)/0.28)]";

  return (
    <TooltipProvider delayDuration={200}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                className={
                  "flex items-center gap-1.5 h-8 px-2 rounded-md text-xs font-medium transition-colors shrink-0 " +
                  tone
                }
                aria-label="Công cụ điều khiển máy"
              >
                <Wrench className="h-3.5 w-3.5" />
                <span className="font-mono tabular-nums hidden sm:inline">
                  {toolsEnabled ? TOOL_COUNT : "0"}
                </span>
                {bypass && (
                  <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {toolsEnabled
              ? `${TOOL_COUNT} công cụ • ${bypass ? "Bypass BẬT" : requireConfirm ? "Xác nhận trước khi chạy" : "Tự chạy mức thấp/trung bình"}`
              : "Công cụ điều khiển máy đang tắt"}
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="end" className="w-80 p-3 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-warning" />
                Công cụ điều khiển máy
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {isElectron() ? "Chế độ thật (desktop app)" : "Giả lập — mở desktop app để dùng thật"}
              </div>
            </div>
            <Switch
              checked={toolsEnabled}
              onCheckedChange={onToolsEnabledChange}
              aria-label="Bật/tắt công cụ"
            />
          </div>

          <div className="text-xs text-muted-foreground border-t border-border pt-2">
            {statusText(toolsEnabled, bypass, requireConfirm)}
          </div>

          {toolsEnabled && (
            <div
              className={
                "flex flex-col gap-2 px-2.5 py-2 rounded-md border " +
                (bypass
                  ? "bg-destructive/10 border-destructive/40 text-destructive"
                  : "bg-background/60 border-border")
              }
            >
              <div className="flex items-center gap-2">
                <ShieldOff className={"h-3.5 w-3.5 " + (bypass ? "" : "opacity-60")} />
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor="bypass-switch-compact"
                    className="text-xs font-medium cursor-pointer select-none block"
                  >
                    Bypass duyệt
                  </Label>
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    Tự duyệt mọi tool — chỉ dùng khi tin tưởng prompt
                  </div>
                </div>
                <Switch
                  id="bypass-switch-compact"
                  checked={bypass}
                  onCheckedChange={onBypassChange}
                />
              </div>
              <BypassDefaultRow />
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => onCollapsedChange(false)}
          >
            <Maximize2 className="h-3 w-3 mr-1.5" />
            Mở rộng thanh đầy đủ
          </Button>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

/**
 * Full bar — sits below TopBar. Has a collapse button at the right edge.
 */
export function ControlBarFull(props: ControlBarProps) {
  const {
    toolsEnabled,
    onToolsEnabledChange,
    bypass,
    onBypassChange,
    requireConfirm,
    onCollapsedChange,
  } = props;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="border-b border-border bg-[hsl(var(--warning)/0.08)] px-4 py-2 flex items-center gap-3 flex-wrap relative z-10">
        <Wrench className="h-3.5 w-3.5 text-warning" />
        <Label htmlFor="tools-switch" className="text-sm cursor-pointer">
          Công cụ điều khiển máy {isElectron() ? "(thật)" : "(giả lập — mở trong desktop app để dùng thật)"}
        </Label>
        <Switch id="tools-switch" checked={toolsEnabled} onCheckedChange={onToolsEnabledChange} />
        <span className="text-xs text-muted-foreground">
          {toolsEnabled
            ? `${TOOL_COUNT} công cụ • ${bypass ? "Bypass: tự duyệt mọi lệnh" : requireConfirm ? "Xác nhận trước khi chạy" : "Tự chạy mức thấp/trung bình"}`
            : "Bật để cho phép AI yêu cầu công cụ"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {toolsEnabled && (
            <div
              className={
                "flex items-center gap-2 px-2.5 py-1 rounded-md border transition-colors " +
                (bypass
                  ? "bg-destructive/10 border-destructive/40 text-destructive"
                  : "bg-background/60 border-border hover:bg-muted/50")
              }
            >
              <ShieldOff className={"h-3.5 w-3.5 " + (bypass ? "" : "opacity-60")} />
              <Label
                htmlFor="bypass-switch"
                className="text-xs font-medium cursor-pointer select-none"
                title="Tự động duyệt MỌI tool call (kể cả high-risk + sudo) — chỉ dùng khi tin tưởng prompt"
              >
                Bypass duyệt
              </Label>
              <Switch id="bypass-switch" checked={bypass} onCheckedChange={onBypassChange} />
            </div>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => onCollapsedChange(true)}
                aria-label="Thu gọn thanh công cụ"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Thu gọn thành icon nhỏ trên TopBar
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
