import { useEffect, useRef, useState } from "react";
import { Brain, ChevronDown, ChevronRight, FastForward } from "lucide-react";
import { Markdown } from "./Markdown";
import { cn } from "@/lib/utils";

interface Props {
  content: string;
  defaultOpen?: boolean;
  /** True while the model is still emitting reasoning tokens — enables live scroll + Skip button. */
  streaming?: boolean;
  /** Optional handler — when provided and streaming for >=5s, a "Trả lời luôn" button appears. */
  onSkip?: () => void;
}

/**
 * Claude-style thinking block.
 * - Collapsed: shows last 2–3 lines auto-scrolling while reasoning streams.
 * - Expanded: full markdown + token count.
 * - When `streaming` and `onSkip` provided, shows a Skip button after 5 s.
 */
export function ThinkingBlock({ content, defaultOpen = false, streaming = false, onSkip }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [skipVisible, setSkipVisible] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef<number>(Date.now());

  // Reveal "Skip" button after 5 s of streaming.
  useEffect(() => {
    if (!streaming || !onSkip) {
      setSkipVisible(false);
      return;
    }
    const elapsed = Date.now() - startedAt.current;
    if (elapsed >= 5000) {
      setSkipVisible(true);
      return;
    }
    const t = setTimeout(() => setSkipVisible(true), 5000 - elapsed);
    return () => clearTimeout(t);
  }, [streaming, onSkip]);

  // Auto-scroll preview to the bottom as new tokens arrive.
  useEffect(() => {
    if (!open && previewRef.current && streaming) {
      previewRef.current.scrollTop = previewRef.current.scrollHeight;
    }
  }, [content, open, streaming]);

  const trimmed = content.trim();
  if (!trimmed && !streaming) return null;

  // Approximate token count: ~4 chars / token.
  const approxTokens = Math.max(1, Math.round(trimmed.length / 4));
  const lines = trimmed.split("\n").filter(Boolean);
  // Show last ~3 lines for the rolling preview.
  const previewLines = lines.slice(-3).join("\n");

  return (
    <div
      className={cn(
        "my-2 rounded-xl border border-thinking bg-thinking/40 overflow-hidden transition-shadow",
        streaming && "shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]",
      )}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-thinking/60 transition text-thinking-foreground"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <Brain className={cn("h-3.5 w-3.5 shrink-0", streaming && "animate-pulse")} />
        <span className="font-medium shrink-0">
          {streaming ? "Đang suy nghĩ…" : "Đã suy nghĩ"}
        </span>
        <span className="text-thinking-foreground/60 text-[10px] tabular-nums shrink-0">
          {approxTokens} tokens
        </span>
        {skipVisible && onSkip && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSkip();
            }}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-primary/10 text-primary hover:bg-primary/20 transition shrink-0 animate-fade-in"
            title="Bỏ qua phần suy nghĩ và bắt đầu trả lời"
          >
            <FastForward className="h-3 w-3" />
            Trả lời luôn
          </button>
        )}
      </button>

      {/* Rolling preview while collapsed */}
      {!open && previewLines && (
        <div
          ref={previewRef}
          className="px-3 pb-2 max-h-[3.6rem] overflow-hidden text-[11px] italic text-thinking-foreground/70 leading-tight whitespace-pre-wrap"
          style={{
            maskImage: "linear-gradient(to bottom, transparent 0%, black 40%, black 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 40%, black 100%)",
          }}
        >
          {previewLines}
        </div>
      )}

      {open && (
        <div className="px-3 pb-3 pt-1 text-sm text-thinking-foreground border-t border-thinking">
          <Markdown content={trimmed} />
        </div>
      )}
    </div>
  );
}

/**
 * Split a model response into [thinking, visible] segments.
 * Supports <think>...</think> and <thinking>...</thinking> wrappers.
 */
export function splitThinking(raw: string): Array<{ kind: "think" | "text"; content: string; open?: boolean }> {
  if (!raw) return [];
  const parts: Array<{ kind: "think" | "text"; content: string; open?: boolean }> = [];
  const re = /<(think|thinking)>([\s\S]*?)<\/\1>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) parts.push({ kind: "text", content: raw.slice(last, m.index) });
    parts.push({ kind: "think", content: m[2] });
    last = m.index + m[0].length;
  }
  if (last < raw.length) {
    const tail = raw.slice(last);
    // Handle in-progress unclosed <think> during streaming
    const openIdx = tail.search(/<(think|thinking)>/i);
    if (openIdx !== -1) {
      const before = tail.slice(0, openIdx);
      const after = tail.slice(openIdx).replace(/<(think|thinking)>/i, "");
      if (before) parts.push({ kind: "text", content: before });
      // Mark this segment as still-open — useful for showing the streaming UI.
      parts.push({ kind: "think", content: after, open: true });
    } else {
      parts.push({ kind: "text", content: tail });
    }
  }
  return parts;
}
