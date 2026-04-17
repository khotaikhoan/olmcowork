import { useEffect, useRef, useState } from "react";
import { MousePointerClick, Loader2, Keyboard } from "lucide-react";
import { toast } from "sonner";
import type { VisionMark } from "@/lib/bridge";
import { isElectron } from "@/lib/bridge";

/**
 * Map an accessibility role string to a semantic color category.
 * Returns a key used to pick HSL values from the design system.
 */
type RoleColor = "button" | "link" | "input" | "menu" | "checkbox" | "default";

function roleToColor(role?: string): RoleColor {
  if (!role) return "default";
  const r = role.toLowerCase();
  // Buttons
  if (/(button|btn|axbutton|toolbar|tab\b)/.test(r)) return "button";
  // Links
  if (/(link|hyperlink|url|axlink)/.test(r)) return "link";
  // Text inputs / editable fields
  if (/(textfield|textarea|searchfield|combobox|edit|input|axtextfield|axtextarea)/.test(r))
    return "input";
  // Menus / popups
  if (/(menu|popup|dropdown|axmenu|menuitem)/.test(r)) return "menu";
  // Checkboxes / radios / switches
  if (/(checkbox|radio|switch|toggle|axcheckbox|axradiobutton)/.test(r)) return "checkbox";
  return "default";
}

/**
 * HSL color tokens per role. We inline raw HSL (not design-token vars)
 * because each role needs a distinct hue not present in the semantic palette.
 * Values are tuned for readability over both light + dark screenshots.
 */
const ROLE_COLORS: Record<RoleColor, { border: string; fill: string; badgeBg: string; badgeFg: string; label: string }> = {
  button:   { border: "hsl(217 91% 60%)", fill: "hsl(217 91% 60% / 0.18)", badgeBg: "hsl(217 91% 60%)", badgeFg: "hsl(0 0% 100%)", label: "btn" },
  link:     { border: "hsl(271 81% 66%)", fill: "hsl(271 81% 66% / 0.18)", badgeBg: "hsl(271 81% 66%)", badgeFg: "hsl(0 0% 100%)", label: "link" },
  input:    { border: "hsl(142 71% 45%)", fill: "hsl(142 71% 45% / 0.18)", badgeBg: "hsl(142 71% 45%)", badgeFg: "hsl(0 0% 100%)", label: "input" },
  menu:     { border: "hsl(25 95% 53%)",  fill: "hsl(25 95% 53% / 0.18)",  badgeBg: "hsl(25 95% 53%)",  badgeFg: "hsl(0 0% 100%)", label: "menu" },
  checkbox: { border: "hsl(173 80% 40%)", fill: "hsl(173 80% 40% / 0.18)", badgeBg: "hsl(173 80% 40%)", badgeFg: "hsl(0 0% 100%)", label: "check" },
  default:  { border: "hsl(var(--primary))", fill: "hsl(var(--primary) / 0.10)", badgeBg: "hsl(var(--background))", badgeFg: "hsl(var(--primary))", label: "" },
};

/** Confidence (0..1) → opacity multiplier in [0.45, 1.0]. */
function confidenceToOpacity(c?: number): number {
  if (typeof c !== "number" || isNaN(c)) return 1;
  const clamped = Math.max(0, Math.min(1, c));
  return 0.45 + clamped * 0.55;
}

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
export function VisionMarksOverlay({ image, marks, onClicked, onReannotate }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const [keyBuffer, setKeyBuffer] = useState("");
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

  // Clear key buffer after 800ms of inactivity
  useEffect(() => {
    if (!keyBuffer) return;
    const t = setTimeout(() => setKeyBuffer(""), 800);
    return () => clearTimeout(t);
  }, [keyBuffer]);

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
        // Auto re-annotate after a small delay so the UI has time to update
        if (onReannotate) {
          setTimeout(() => onReannotate(), 600);
        }
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

  // Keyboard navigation: type 1-99 to click that mark; Tab cycles
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!electron) return;
    if (e.key === "Tab") {
      e.preventDefault();
      const ids = marks.map((m) => m.id).sort((a, b) => a - b);
      if (ids.length === 0) return;
      const cur = hover ?? ids[0];
      const idx = ids.indexOf(cur);
      const next = e.shiftKey
        ? ids[(idx - 1 + ids.length) % ids.length]
        : ids[(idx + 1) % ids.length];
      setHover(next);
      return;
    }
    if (e.key === "Enter" && hover !== null) {
      e.preventDefault();
      const button: "left" | "right" | "middle" = e.shiftKey
        ? "right"
        : e.altKey
          ? "middle"
          : "left";
      void triggerClick(hover, button);
      return;
    }
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const next = (keyBuffer + e.key).slice(-2);
      setKeyBuffer(next);
      const id = Number(next);
      const exact = marks.find((m) => m.id === id);
      if (exact) {
        setHover(id);
        // If a 2-digit number that matches, click immediately
        if (next.length === 2) {
          setKeyBuffer("");
          const button: "left" | "right" | "middle" = e.shiftKey
            ? "right"
            : e.altKey
              ? "middle"
              : "left";
          void triggerClick(id, button);
        }
      }
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
      tabIndex={electron ? 0 : -1}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={handleKeyDown}
      className={
        "relative w-full overflow-hidden rounded-md border bg-muted/20 outline-none transition-shadow " +
        (focused ? "border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.3)]" : "border-border")
      }
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
          const colorKey = roleToColor(m.role);
          const colors = ROLE_COLORS[colorKey];
          const conf = (m as VisionMark & { confidence?: number }).confidence;
          const opacity = confidenceToOpacity(conf);
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
              style={{ left, top, width, height, opacity }}
              title={
                interactive
                  ? `#${m.id} · ${m.role ?? ""} ${m.label ?? ""}${typeof conf === "number" ? ` (conf ${(conf * 100).toFixed(0)}%)` : ""} — click (Shift=right, Alt=middle)`
                  : `${m.role ?? ""} ${m.label ?? ""} (chỉ click được trong app desktop)`
              }
            >
              <div
                className={"absolute inset-0 rounded-sm transition-all " + (isBusy ? "animate-pulse" : "")}
                style={{
                  border: `2px solid ${isBusy ? "hsl(var(--success))" : colors.border}`,
                  background: isBusy
                    ? "hsl(var(--success) / 0.20)"
                    : isHover
                      ? colors.fill.replace("0.18", "0.28")
                      : colors.fill,
                  boxShadow: isHover ? `0 0 0 1px ${colors.border}` : undefined,
                }}
              />
              <div
                className={
                  "absolute top-0 left-0 min-w-[16px] h-4 px-1 rounded-br-md rounded-tl-sm flex items-center justify-center font-mono text-[10px] font-bold shadow-sm transition-all " +
                  (isHover ? "scale-110" : "")
                }
                style={{
                  background: isBusy ? "hsl(var(--success))" : colors.badgeBg,
                  color: isBusy ? "hsl(var(--background))" : colors.badgeFg,
                }}
              >
                {isBusy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : m.id}
              </div>
              {isHover && !isBusy && (
                <div className="absolute top-full left-0 mt-1 px-2 py-1 rounded-md bg-popover border border-border text-[11px] shadow-lg whitespace-nowrap z-10 max-w-[260px] truncate flex items-center gap-1.5">
                  {colors.label && (
                    <span
                      className="font-mono text-[10px] px-1 rounded"
                      style={{ background: colors.badgeBg, color: colors.badgeFg }}
                    >
                      {colors.label}
                    </span>
                  )}
                  <span className="font-mono text-muted-foreground">{m.role}</span>
                  <span>{m.label}</span>
                  {typeof conf === "number" && (
                    <span className="text-muted-foreground">· {(conf * 100).toFixed(0)}%</span>
                  )}
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
          <span className="text-muted-foreground inline-flex items-center gap-1">
            · click hoặc <Keyboard className="h-3 w-3" /> số 1-99 / Tab
          </span>
        )}
        {keyBuffer && (
          <span className="ml-1 px-1 rounded bg-primary/20 text-primary font-bold">
            {keyBuffer}
          </span>
        )}
      </div>
    </div>
  );
}
