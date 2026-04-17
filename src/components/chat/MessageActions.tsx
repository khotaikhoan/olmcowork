import { useState } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  content: string;
  onRegenerate?: () => void;
  className?: string;
}

export function MessageActions({ content, onRegenerate, className }: Props) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div
      className={cn(
        "flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={copy}
        title="Sao chép"
      >
        {copied ? (
          <Check className="h-3 w-3 text-[hsl(var(--success))]" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </Button>
      {onRegenerate && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onRegenerate}
          title="Tạo lại"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
