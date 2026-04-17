import { useEffect, useRef, useState } from "react";
import { MousePointerClick, Loader2, Keyboard } from "lucide-react";
import { toast } from "sonner";
import type { VisionMark } from "@/lib/bridge";
import { isElectron } from "@/lib/bridge";

interface Props {
  image: string; // base64 png (no data: prefix)
  marks: VisionMark[];
  /** Optional callback after a successful remote click. */
  onClicked?: (markId: number, button: "left" | "right" | "middle") => void;
  /** If provided, called after a successful click to re-capture the screen. */
  onReannotate?: () => void;
}

/**
 * Renders a screenshot with numbered overlays drawn on top of every detected
 * accessibility mark. Clicking a mark sends a real `vision_click` through the
 * Electron bridge (left-click). Shift+click → right-click. Alt+click → middle.
 */
export function VisionMarksOverlay({ image, marks, onClicked }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const electron = isElectron();

  useEffect(() => {
    if (!wrapRef.current || !natural) return;
    const ro = new ResizeObserver(() => {
      const w = wrapRef.current!.clientWidth;
      setScale(w / natural.w);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [natural]);

  const triggerClick = async (
    markId: number,
    button: "left" | "right" | "middle",
  ) => {
    if (!electron || !window.bridge) {
      toast.error("Remote click chỉ hoạt động trong app desktop (Electron).");
      return;
    }
    if (busy !== null) return;
    setBusy(markId);
    try {
      const res = await window.bridge.visionClick(markId, button);
      if (res.ok) {
        toast.success(
          `${button === "left" ? "Click" : button === "right" ? "Right-click" : "Middle-click"} #${markId}`,
          { description: res.output?.slice(0, 120) },
        );
        onClicked?.(markId, button);
      } else {
        toast.error(`Click #${markId} thất bại`, { description: res.output });
      }
    } catch (e) {
      toast.error(`Click #${markId} lỗi`, {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const handleMarkClick = (e: React.MouseEvent, markId: number) => {
    e.preventDefault();
    e.stopPropagation();
    const button: "left" | "right" | "middle" = e.shiftKey
      ? "right"
      : e.altKey
        ? "middle"
        : "left";
    void triggerClick(markId, button);
  };

  const handleContextMenu = (e: React.MouseEvent, markId: number) => {
    e.preventDefault();
    e.stopPropagation();
    void triggerClick(markId, "right");
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-hidden rounded-md border border-border bg-muted/20"
    >
      <img
        ref={imgRef}
        src={`data:image/png;base64,${image}`}
        alt="annotated screenshot"
        className="block w-full h-auto select-none"
        draggable={false}
        onLoad={(e) => {
          const im = e.currentTarget;
          setNatural({ w: im.naturalWidth, h: im.naturalHeight });
          setScale(im.clientWidth / im.naturalWidth);
        }}
      />
      <div className="absolute inset-0 pointer-events-none">
        {marks.map((m) => {
          const left = m.x * scale;
          const top = m.y * scale;
          const width = m.w * scale;
          const height = m.h * scale;
          const isHover = hover === m.id;
          const isBusy = busy === m.id;
          const interactive = electron;
          return (
            <button
              type="button"
              key={m.id}
              disabled={!interactive || busy !== null}
              onMouseEnter={() => setHover(m.id)}
              onMouseLeave={() => setHover(null)}
              onClick={(e) => handleMarkClick(e, m.id)}
              onContextMenu={(e) => handleContextMenu(e, m.id)}
              className={
                "absolute pointer-events-auto transition-all p-0 m-0 bg-transparent border-0 " +
                (interactive
                  ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  : "cursor-not-allowed")
              }
              style={{ left, top, width, height }}
              title={
                interactive
                  ? `Click để gửi vision_click #${m.id} (Shift = right, Alt = middle) — ${m.role ?? ""} ${m.label ?? ""}`
                  : `${m.role ?? ""} ${m.label ?? ""} (chỉ click được trong app desktop)`
              }
            >
              <div
                className={
                  "absolute inset-0 rounded-sm border-2 transition-all " +
                  (isBusy
                    ? "border-[hsl(var(--success))] bg-[hsl(var(--success))]/20 animate-pulse"
                    : isHover
                      ? "border-primary bg-primary/15"
                      : "border-primary/60 bg-primary/5")
                }
              />
              <div
                className={
                  "absolute -top-1.5 -left-1.5 min-w-[20px] h-5 px-1 rounded-md flex items-center justify-center font-mono text-[11px] font-bold shadow-md transition-all " +
                  (isBusy
                    ? "bg-[hsl(var(--success))] text-background"
                    : isHover
                      ? "bg-primary text-primary-foreground scale-110"
                      : "bg-background text-primary border border-primary/60")
                }
              >
                {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : m.id}
              </div>
              {isHover && !isBusy && (
                <div className="absolute top-full left-0 mt-1 px-2 py-1 rounded-md bg-popover border border-border text-[11px] shadow-lg whitespace-nowrap z-10 max-w-[260px] truncate flex items-center gap-1.5">
                  <span className="font-mono text-muted-foreground">
                    {m.role}
                  </span>
                  <span>{m.label}</span>
                  {interactive && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-primary">
                      <MousePointerClick className="h-3 w-3" />
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-background/80 backdrop-blur text-[11px] font-mono border border-border flex items-center gap-1.5">
        <span>{marks.length} marks</span>
        {electron && (
          <span className="text-muted-foreground">
            · click để điều khiển
          </span>
        )}
      </div>
    </div>
  );
}
