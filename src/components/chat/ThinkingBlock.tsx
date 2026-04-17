import { useState } from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import { Markdown } from "./Markdown";

interface Props {
  content: string;
  defaultOpen?: boolean;
}

/**
 * Renders a Claude-style "thinking" block — collapsed by default,
 * showing a brief preview line. Click to expand the full reasoning.
 */
export function ThinkingBlock({ content, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const trimmed = content.trim();
  if (!trimmed) return null;
  const preview = trimmed.split("\n")[0].slice(0, 80);

  return (
    <div className="my-2 rounded-xl border border-thinking bg-thinking/40 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-thinking/60 transition text-thinking-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Brain className="h-3.5 w-3.5" />
        <span className="font-medium">Đang suy nghĩ</span>
        {!open && (
          <span className="text-thinking-foreground/70 truncate font-normal italic">
            {preview}
          </span>
        )}
      </button>
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
export function splitThinking(raw: string): Array<{ kind: "think" | "text"; content: string }> {
  if (!raw) return [];
  const parts: Array<{ kind: "think" | "text"; content: string }> = [];
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
      parts.push({ kind: "think", content: after });
    } else {
      parts.push({ kind: "text", content: tail });
    }
  }
  return parts;
}
