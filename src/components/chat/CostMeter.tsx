import { DollarSign } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatUsd, PRICING } from "@/lib/pricing";

interface Props {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
}

export function CostMeter({ model, inputTokens, outputTokens, totalCostUsd }: Props) {
  const price = PRICING[model];
  const isFree = !price;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title="Chi phí ước tính của hội thoại"
          className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-muted/50 hover:bg-muted transition-colors font-mono"
        >
          <DollarSign className="h-3 w-3" />
          {isFree ? "free" : formatUsd(totalCostUsd)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3 space-y-2">
        <div className="text-xs font-medium">Chi phí ước tính</div>
        {isFree ? (
          <p className="text-xs text-muted-foreground">
            Model <code className="font-mono">{model || "—"}</code> chạy local (Ollama) — miễn phí.
          </p>
        ) : (
          <>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Input</span>
              <span className="font-mono">{inputTokens.toLocaleString()} tok</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Output</span>
              <span className="font-mono">{outputTokens.toLocaleString()} tok</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between text-sm font-semibold">
              <span>Tổng</span>
              <span className="font-mono">{formatUsd(totalCostUsd)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Giá: ${price.input}/M input · ${price.output}/M output
            </p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
