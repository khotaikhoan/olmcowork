import { ArrowDown } from "lucide-react";

interface Props {
  count: number;
  onJump?: () => void;
}

/**
 * Horizontal divider rendered above the first message that arrived while the
 * tab was hidden. Shows "↓ N tin nhắn mới · click để cuộn" so the user knows
 * exactly where they stopped reading.
 */
export function UnreadDivider({ count, onJump }: Props) {
  return (
    <div
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
