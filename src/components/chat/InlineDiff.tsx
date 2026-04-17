import { diffLines } from "diff";
import { cn } from "@/lib/utils";

interface Props {
  oldStr: string;
  newStr: string;
  /** filename or path shown above */
  label?: string;
}

/**
 * Compact inline unified-diff renderer for `text_editor.str_replace`.
 * Renders red/green hunks line-by-line so users can see exactly what changed.
 */
export function InlineDiff({ oldStr, newStr, label }: Props) {
  const parts = diffLines(oldStr || "", newStr || "");
  let added = 0;
  let removed = 0;
  for (const p of parts) {
    if (p.added) added += p.count ?? 0;
    if (p.removed) removed += p.count ?? 0;
  }

  return (
    <div className="rounded-md border border-border overflow-hidden bg-background">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted text-[11px] font-mono">
        <span className="truncate text-muted-foreground">{label || "diff"}</span>
        <span className="flex gap-2 shrink-0">
          <span className="text-[hsl(var(--success))]">+{added}</span>
          <span className="text-destructive">−{removed}</span>
        </span>
      </div>
      <pre className="text-xs font-mono overflow-auto max-h-80 m-0">
        {parts.map((p, i) => {
          const lines = p.value.replace(/\n$/, "").split("\n");
          return lines.map((ln, j) => (
            <div
              key={`${i}-${j}`}
              className={cn(
                "px-3 py-0.5 whitespace-pre",
                p.added && "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
                p.removed && "bg-destructive/10 text-destructive",
                !p.added && !p.removed && "text-muted-foreground",
              )}
            >
              <span className="opacity-60 select-none mr-2">
                {p.added ? "+" : p.removed ? "−" : " "}
              </span>
              {ln || "\u00A0"}
            </div>
          ));
        })}
      </pre>
    </div>
  );
}
