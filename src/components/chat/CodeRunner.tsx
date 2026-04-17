import { useState } from "react";
import { Play, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runJs, RunResult } from "@/lib/jsRunner";
import { cn } from "@/lib/utils";

interface Props {
  code: string;
  language: string;
}

/**
 * "▶ Run" button for JS/TS code blocks. Executes inside a Web Worker
 * with a 5s timeout. Renders captured console output + return value.
 * Only enabled for js/ts/javascript/typescript/jsx/tsx.
 */
export function CodeRunner({ code, language }: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const supported = ["js", "javascript", "ts", "typescript", "jsx", "tsx"].includes(
    language.toLowerCase(),
  );
  if (!supported) return null;

  const run = async () => {
    setRunning(true);
    setResult(null);
    const r = await runJs(code);
    setResult(r);
    setRunning(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2"
        onClick={run}
        disabled={running}
        title="Chạy trong sandbox (5s timeout)"
      >
        {running ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Play className="h-3 w-3" />
        )}
        <span className="ml-1 text-[11px]">Run</span>
      </Button>
      {result && (
        <div className="border-t border-border bg-background/60 p-2 space-y-1 text-xs font-mono relative">
          <button
            onClick={() => setResult(null)}
            className="absolute top-1 right-1 h-5 w-5 rounded hover:bg-muted flex items-center justify-center"
            title="Đóng"
          >
            <X className="h-3 w-3" />
          </button>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className={result.ok ? "text-[hsl(var(--success))]" : "text-destructive"}>
              {result.ok ? "✓ Done" : "✗ Error"}
            </span>
            <span>{result.durationMs.toFixed(0)}ms</span>
          </div>
          {result.logs.map((l, i) => (
            <div
              key={i}
              className={cn(
                "whitespace-pre-wrap break-all",
                l.level === "error" && "text-destructive",
                l.level === "warn" && "text-warning",
                l.level === "info" && "text-primary",
              )}
            >
              <span className="opacity-50">{l.level}: </span>
              {l.args
                .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
                .join(" ")}
            </div>
          ))}
          {result.error && (
            <div className="text-destructive whitespace-pre-wrap">{result.error}</div>
          )}
          {result.ok && result.result !== undefined && (
            <div>
              <span className="opacity-50">→ </span>
              {typeof result.result === "object"
                ? JSON.stringify(result.result, null, 2)
                : String(result.result)}
            </div>
          )}
        </div>
      )}
    </>
  );
}
