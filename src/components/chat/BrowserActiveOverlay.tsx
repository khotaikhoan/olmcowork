import { useEffect, useRef, useState } from "react";
import { Globe, X, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface BrowserStatus {
  active: boolean;
  url: string | null;
  tabs: number;
  headless: boolean;
  useRealProfile: boolean;
}

/**
 * Floating overlay shown only when the Playwright-controlled browser is open.
 * Gives the user a clear "AI is driving the browser" indicator + a one-click Stop,
 * and streams the *current* browser action (e.g. "click submit button") from the
 * Electron main process via the `browser:action` IPC channel.
 */
export function BrowserActiveOverlay() {
  const bridge = typeof window !== "undefined" ? (window as any).bridge : undefined;
  const [status, setStatus] = useState<BrowserStatus | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const clearTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!bridge?.onBrowserStatus) return;
    bridge.browserStatus?.().then((s: any) => {
      if (s) setStatus({ active: !!s.active, url: s.url ?? null, tabs: s.tabs ?? 0, headless: !!s.headless, useRealProfile: !!s.useRealProfile });
    });
    const offStatus = bridge.onBrowserStatus((s: BrowserStatus) => setStatus(s));
    const offAction = bridge.onBrowserAction?.((a: { label: string | null }) => {
      // Debounce-clear: hold the last label for 1.2s after main signals "null"
      // so the user can read short-lived actions like clicks.
      if (clearTimer.current) { window.clearTimeout(clearTimer.current); clearTimer.current = null; }
      if (a.label) {
        setAction(a.label);
      } else {
        clearTimer.current = window.setTimeout(() => setAction(null), 1200);
      }
    });
    return () => {
      try { offStatus?.(); } catch { /* ignore */ }
      try { offAction?.(); } catch { /* ignore */ }
      if (clearTimer.current) window.clearTimeout(clearTimer.current);
    };
  }, [bridge]);

  if (!bridge?.isElectron || !status?.active) return null;

  const handleStop = async () => {
    setClosing(true);
    try {
      await bridge.browserClose?.();
      toast.success("Đã đóng trình duyệt");
    } catch (e: any) {
      toast.error(`Không đóng được: ${e?.message ?? String(e)}`);
    } finally {
      setClosing(false);
    }
  };

  // Truncate long URLs for display.
  const displayUrl = status.url
    ? (() => {
        try {
          const u = new URL(status.url);
          return u.host + (u.pathname !== "/" ? u.pathname.slice(0, 24) + (u.pathname.length > 24 ? "…" : "") : "");
        } catch { return status.url.slice(0, 40); }
      })()
    : "about:blank";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-2xl border border-primary/40 bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 max-w-[min(92vw,420px)]"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
      <div className="flex flex-col leading-tight min-w-0 flex-1">
        <span className="text-xs font-medium truncate">
          {action ? (
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary shrink-0" />
              <span className="truncate">đang {action}</span>
            </span>
          ) : (
            "AI đang điều khiển trình duyệt"
          )}
        </span>
        <span className="text-[10px] text-muted-foreground truncate">
          {displayUrl}{status.tabs > 1 ? ` · ${status.tabs} tabs` : ""}{status.useRealProfile ? " · profile thật" : ""}
        </span>
      </div>
      <Button
        size="sm"
        variant="destructive"
        className="h-6 px-2 text-xs gap-1 ml-1 shrink-0"
        onClick={handleStop}
        disabled={closing}
        title="Đóng trình duyệt và dừng tự động hoá"
      >
        {closing ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
        Stop
      </Button>
    </div>
  );
}
