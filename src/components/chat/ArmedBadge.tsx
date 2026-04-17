// Live countdown badge shown in TopBar when armed-mode is active.
// Click to disarm immediately. Pulses red so user can't miss it.
import { useEffect, useState } from "react";
import { ShieldAlert, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  disarm,
  formatRemaining,
  getArmedRemainingMs,
  subscribeArmed,
} from "@/lib/armed";

interface Props {
  className?: string;
}

export function ArmedBadge({ className }: Props) {
  const [remaining, setRemaining] = useState<number>(getArmedRemainingMs());

  useEffect(() => {
    const off = subscribeArmed(() => setRemaining(getArmedRemainingMs()));
    const id = window.setInterval(() => setRemaining(getArmedRemainingMs()), 500);
    return () => { off(); window.clearInterval(id); };
  }, []);

  if (remaining <= 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => disarm()}
            className={
              "h-7 gap-1.5 px-2 rounded-full border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 animate-pulse " +
              (className ?? "")
            }
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span className="font-mono text-xs font-semibold tabular-nums">
              ARMED {formatRemaining(remaining)}
            </span>
            <ShieldOff className="h-3 w-3 opacity-60" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          Deep-system tools đang mở (sudo, script, raw file).<br />
          Click để disarm ngay.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
