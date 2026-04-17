import { Coins } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Props {
  /** Total tokens estimated for the active conversation history */
  totalTokens: number;
  /** Tokens generated in the last assistant reply */
  lastReplyTokens?: number;
  /** Tokens per second of the last reply */
  tokensPerSecond?: number;
}

function fmt(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(2) + "k";
  return Math.round(n / 1000) + "k";
}

/**
 * Displays a rough token count for the current conversation. Uses the
 * 4-chars-per-token heuristic — accurate enough for budgeting at a glance.
 */
export function TokenMeter({ totalTokens, lastReplyTokens, tokensPerSecond }: Props) {
  const pctOf128k = Math.min(100, (totalTokens / 128_000) * 100);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title="Token đã dùng trong hội thoại này"
          className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors font-mono"
        >
          <Coins className="h-3 w-3" />
          {fmt(totalTokens)}
          {tokensPerSecond != null && tokensPerSecond > 0 && (
            <span className="text-[hsl(var(--success))]">
              · {tokensPerSecond.toFixed(1)} t/s
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 space-y-2.5">
        <div className="text-xs font-medium">Sử dụng token (ước lượng)</div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Tổng hội thoại</span>
            <span className="font-mono">{totalTokens.toLocaleString()}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pctOf128k}%` }}
            />
          </div>
          <div className="text-[10px] text-muted-foreground text-right">
            {pctOf128k.toFixed(1)}% / 128k context
          </div>
        </div>
        {lastReplyTokens != null && lastReplyTokens > 0 && (
          <div className="flex justify-between text-xs pt-1 border-t border-border">
            <span className="text-muted-foreground">Reply gần nhất</span>
            <span className="font-mono">{lastReplyTokens.toLocaleString()}</span>
          </div>
        )}
        {tokensPerSecond != null && tokensPerSecond > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Tốc độ</span>
            <span className="font-mono text-[hsl(var(--success))]">
              {tokensPerSecond.toFixed(1)} tok/s
            </span>
          </div>
        )}
        <div className="text-[10px] text-muted-foreground pt-1 border-t border-border">
          Ước lượng theo công thức 4 ký tự ≈ 1 token. Số thực có thể chênh ±20%.
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Heuristic char→token ratio. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
