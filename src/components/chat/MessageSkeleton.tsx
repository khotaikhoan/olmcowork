import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Shimmer placeholder that mimics a chat bubble while messages are loading
 * from the backend. Renders an avatar circle plus 2–3 text lines of varying
 * width to suggest natural paragraph rhythm.
 *
 * Pass `align="right"` to mirror the layout for outgoing (user) bubbles.
 */
export function MessageSkeleton({
  align = "left",
  lines = 3,
}: {
  align?: "left" | "right";
  lines?: 2 | 3;
}) {
  const isRight = align === "right";
  // Pre-baked width patterns so skeletons feel like real paragraphs, not bars.
  const widths = lines === 2 ? ["w-3/4", "w-1/2"] : ["w-5/6", "w-4/6", "w-3/6"];

  return (
    <div
      className={cn(
        "flex gap-3 py-4 animate-fade-in",
        isRight && "flex-row-reverse",
      )}
      aria-hidden="true"
    >
      <Skeleton className="h-8 w-8 rounded-xl shrink-0" />
      <div
        className={cn(
          "max-w-[80%] flex-1 space-y-2",
          isRight && "flex flex-col items-end",
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-3 space-y-2 w-full",
            isRight ? "bg-primary/10" : "bg-card border border-border",
          )}
        >
          {widths.map((w, i) => (
            <Skeleton key={i} className={cn("h-3.5 rounded-full", w)} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Convenience: a varied stack of skeletons for the conversation loader. */
export function MessageSkeletonList() {
  return (
    <div className="space-y-1">
      <MessageSkeleton align="right" lines={2} />
      <MessageSkeleton align="left" lines={3} />
      <MessageSkeleton align="right" lines={2} />
      <MessageSkeleton align="left" lines={3} />
    </div>
  );
}
