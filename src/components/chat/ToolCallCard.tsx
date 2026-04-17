import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolCallStatus = "pending" | "approved" | "running" | "done" | "denied" | "error";

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, any>;
  status: ToolCallStatus;
  result?: string;
}

export function ToolCallCard({ call }: { call: ToolCallRecord }) {
  const [open, setOpen] = useState(false);

  const statusUI = () => {
    switch (call.status) {
      case "pending":
        return { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: "Awaiting approval", cls: "text-[hsl(var(--warning))]" };
      case "approved":
      case "running":
        return { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: "Running…", cls: "text-primary" };
      case "done":
        return { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Completed", cls: "text-[hsl(var(--success))]" };
      case "denied":
        return { icon: <XCircle className="h-3.5 w-3.5" />, label: "Denied", cls: "text-muted-foreground" };
      case "error":
        return { icon: <XCircle className="h-3.5 w-3.5" />, label: "Error", cls: "text-destructive" };
    }
  };

  const s = statusUI();

  return (
    <div className="my-2 rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-xs">{call.name}</span>
        <div className={cn("ml-auto flex items-center gap-1.5 text-xs", s.cls)}>
          {s.icon}
          <span>{s.label}</span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-border bg-muted/20">
          <div>
            <div className="text-[11px] font-medium text-muted-foreground my-1.5">Arguments</div>
            <pre className="text-xs font-mono bg-background border border-border rounded p-2 overflow-x-auto">
              {JSON.stringify(call.args, null, 2)}
            </pre>
          </div>
          {call.result !== undefined && (
            <div>
              <div className="text-[11px] font-medium text-muted-foreground my-1.5">Result</div>
              <pre className="text-xs font-mono bg-background border border-border rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-60">
                {call.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
