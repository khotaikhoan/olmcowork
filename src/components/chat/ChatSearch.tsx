import { useEffect, useState } from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Returns count of matches in current chat for the given query. */
  matchCount: number;
  query: string;
  onQueryChange: (q: string) => void;
  currentIndex: number;
  onNavigate: (dir: 1 | -1) => void;
}

export function ChatSearch({
  open,
  onClose,
  matchCount,
  query,
  onQueryChange,
  currentIndex,
  onNavigate,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  if (!mounted) return null;

  return (
    <div
      className={
        "absolute top-2 right-4 z-30 flex items-center gap-1 bg-popover border border-border rounded-lg shadow-[var(--shadow-elevated)] p-1.5 transition-all " +
        (open ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none")
      }
    >
      <Search className="h-3.5 w-3.5 text-muted-foreground ml-1" />
      <Input
        autoFocus
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Tìm trong chat…"
        className="h-7 w-56 border-0 bg-transparent focus-visible:ring-0 px-1 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter") onNavigate(e.shiftKey ? -1 : 1);
        }}
      />
      <span className="text-[11px] text-muted-foreground font-mono px-1 min-w-[40px] text-center">
        {matchCount === 0 ? "0/0" : `${currentIndex + 1}/${matchCount}`}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => onNavigate(-1)}
        disabled={matchCount === 0}
      >
        <ChevronUp className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => onNavigate(1)}
        disabled={matchCount === 0}
      >
        <ChevronDown className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

/** Highlight every match of `query` in `text` using <mark>. Case-insensitive. */
export function highlightMatches(text: string, query: string): string {
  if (!query.trim()) return text;
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(
    new RegExp(`(${safe})`, "gi"),
    '<mark class="bg-warning/40 text-foreground rounded-sm px-0.5">$1</mark>',
  );
}
