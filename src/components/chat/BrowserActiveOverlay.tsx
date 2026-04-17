import { useEffect, useState } from "react";
import { Globe, X, Loader2 } from "lucide-react";
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
 * Gives the user a clear "AI is driving the browser" indicator + a one-click Stop.
 * Renders nothing in the web preview (no Electron bridge).
 */
export function BrowserActiveOverlay() {
  const bridge = typeof window !== "undefined" ? (window as any).bridge : undefined;
  const [status, setStatus] = useState<BrowserStatus | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!bridge?.onBrowserStatus) return;
    // Hydrate initial state — browser may have been launched before this component mounted.
    bridge.browserStatus?.().then((s: any) => {
      if (s) setStatus({ active: !!s.active, url: s.url ?? null, tabs: s.tabs ?? 0, headless: !!s.headless, useRealProfile: !!s.useRealProfile });
    });
    const off = bridge.onBrowserStatus((s: BrowserStatus) => setStatus(s));
    return () => { try { off?.(); } catch { /* ignore */ } };
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
      className="fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-full border border-primary/40 bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2"
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-xs font-medium">AI đang điều khiển trình duyệt</span>
        <span className="text-[10px] text-muted-foreground truncate max-w-[220px]">
          {displayUrl}{status.tabs > 1 ? ` · ${status.tabs} tabs` : ""}{status.useRealProfile ? " · profile thật" : ""}
        </span>
      </div>
      <Button
        size="sm"
        variant="destructive"
        className="h-6 px-2 text-xs gap-1 ml-1"
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
