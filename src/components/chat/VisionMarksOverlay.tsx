import { useEffect, useRef, useState } from "react";
import type { VisionMark } from "@/lib/bridge";

interface Props {
  image: string; // base64 png (no data: prefix)
  marks: VisionMark[];
}

/**
 * Renders a screenshot with numbered overlays drawn on top of every detected
 * accessibility mark. Hovering a mark highlights it; the image scales to fit
 * the container while preserving aspect ratio.
 */
export function VisionMarksOverlay({ image, marks }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!wrapRef.current || !natural) return;
    const ro = new ResizeObserver(() => {
      const w = wrapRef.current!.clientWidth;
      setScale(w / natural.w);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [natural]);

  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-md border border-border bg-muted/20">
      <img
        ref={imgRef}
        src={`data:image/png;base64,${image}`}
        alt="annotated screenshot"
        className="block w-full h-auto"
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
          return (
            <div
              key={m.id}
              onMouseEnter={() => setHover(m.id)}
              onMouseLeave={() => setHover(null)}
              className="absolute pointer-events-auto transition-all"
              style={{ left, top, width, height }}
              title={`${m.role ?? ""} ${m.label ?? ""}`}
            >
              <div
                className={
                  "absolute inset-0 rounded-sm border-2 transition-all " +
                  (isHover
                    ? "border-primary bg-primary/15"
                    : "border-primary/60 bg-primary/5")
                }
              />
              <div
                className={
                  "absolute -top-1.5 -left-1.5 min-w-[20px] h-5 px-1 rounded-md flex items-center justify-center font-mono text-[11px] font-bold shadow-md transition-all " +
                  (isHover
                    ? "bg-primary text-primary-foreground scale-110"
                    : "bg-background text-primary border border-primary/60")
                }
              >
                {m.id}
              </div>
              {isHover && m.label && (
                <div className="absolute top-full left-0 mt-1 px-2 py-1 rounded-md bg-popover border border-border text-[11px] shadow-lg whitespace-nowrap z-10 max-w-[260px] truncate">
                  <span className="font-mono text-muted-foreground">{m.role}</span>{" "}
                  <span>{m.label}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-background/80 backdrop-blur text-[11px] font-mono border border-border">
        {marks.length} marks
      </div>
    </div>
  );
}
