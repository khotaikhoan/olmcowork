import { useEffect, useRef } from "react";
import { ArrowDown } from "lucide-react";

interface Props {
  count: number;
  /** Called when the divider scrolls fully into view (auto-clear). */
  onSeen: () => void;
  /** Called when the user clicks the chip (manual jump + clear). */
  onJump?: () => void;
}

/**
 * Horizontal divider rendered above the first message that arrived while the
 * tab was hidden. Auto-clears via IntersectionObserver once the user scrolls
 * past it — no click required. The chip is still clickable as a shortcut.
 */
export function UnreadDivider({ count, onSeen, onJump }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const seenRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seenRef.current) return;
    // Fire onSeen as soon as the divider is at least 60% visible in the
    // scroll container. Threshold avoids accidentally clearing when the
    // chip is barely peeking at the edge.
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            if (!seenRef.current) {
              seenRef.current = true;
              onSeen();
              obs.disconnect();
            }
          }
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [onSeen]);

  return (
    <div
      ref={ref}
      className="my-3 flex items-center gap-3 select-none"
      role="separator"
      aria-label={`${count} tin nhắn mới chưa đọc`}
    >
      <div className="h-px flex-1 bg-primary/30" />
      <button
        type="button"
        onClick={onJump}
        className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
      >
        <ArrowDown className="h-3 w-3" />
        {count} tin nhắn mới
      </button>
      <div className="h-px flex-1 bg-primary/30" />
    </div>
  );
}
