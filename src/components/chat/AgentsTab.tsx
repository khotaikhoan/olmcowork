/**
 * Phase 5 — Agents tab (lives inside ArtifactsPanel).
 *
 * Shows the current spawn tree with status dots, step counters, and a
 * collapsible output preview. Lets the user cancel a single agent or
 * cancel everything in one click.
 */
import { useEffect, useState } from "react";
import {
  AgentNode,
  cancelAgent,
  cancelAllAgents,
  clearFinishedAgents,
  listAgents,
  subscribeAgents,
} from "@/lib/agentOrchestrator";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronRight, X, Trash2, Bot, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function statusDot(status: AgentNode["status"]) {
  const map: Record<AgentNode["status"], string> = {
    queued: "bg-muted-foreground/40",
    running: "bg-primary animate-pulse",
    done: "bg-emerald-500",
    failed: "bg-destructive",
    cancelled: "bg-amber-500",
  };
  return <span className={cn("h-2 w-2 rounded-full shrink-0", map[status])} />;
}

function elapsed(n: AgentNode): string {
  if (!n.startedAt) return "";
  const end = n.finishedAt ?? Date.now();
  const sec = Math.max(0, Math.round((end - n.startedAt) / 1000));
  return `${sec}s`;
}

function AgentRow({
  node,
  depth,
  childrenNodes,
}: {
  node: AgentNode;
  depth: number;
  childrenNodes: Map<string, AgentNode[]>;
}) {
  const [open, setOpen] = useState(node.status === "running");
  const kids = childrenNodes.get(node.id) ?? [];

  return (
    <div className="text-sm">
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 transition group"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {statusDot(node.status)}
        <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{node.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {node.status === "running"
              ? `step ${node.step} · ${elapsed(node)}`
              : node.status === "queued"
                ? "queued…"
                : `${node.status} · ${elapsed(node)}`}
            {" · "}
            {node.tools.length} tools
          </div>
        </div>
        {(node.status === "running" || node.status === "queued") && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={() => cancelAgent(node.id)}
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {open && (
        <div style={{ paddingLeft: `${depth * 16 + 32}px` }} className="pr-2 pb-2 space-y-1.5">
          <div className="text-xs">
            <span className="text-muted-foreground">Goal: </span>
            <span className="text-foreground">{node.goal}</span>
          </div>
          {node.tools.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {node.tools.map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          )}
          {(node.output || node.error) && (
            <pre className="text-xs whitespace-pre-wrap break-words bg-muted/40 rounded p-2 max-h-48 overflow-auto">
              {node.error ?? node.output}
            </pre>
          )}
        </div>
      )}

      {kids.map((c) => (
        <AgentRow key={c.id} node={c} depth={depth + 1} childrenNodes={childrenNodes} />
      ))}
    </div>
  );
}

export function AgentsTab() {
  const [, force] = useState(0);
  useEffect(() => subscribeAgents(() => force((n) => n + 1)), []);

  const all = listAgents();
  const roots = all.filter((n) => !n.parentId);
  const byParent = new Map<string, AgentNode[]>();
  for (const n of all) {
    if (n.parentId) {
      const list = byParent.get(n.parentId) ?? [];
      list.push(n);
      byParent.set(n.parentId, list);
    }
  }

  const running = all.filter((n) => n.status === "running").length;
  const queued = all.filter((n) => n.status === "queued").length;
  const hasFinished = all.some((n) => n.status === "done" || n.status === "failed" || n.status === "cancelled");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <Bot className="h-4 w-4 text-primary" />
        <div className="text-sm font-medium flex-1">
          Sub-agents
          {running > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" /> {running} running
            </span>
          )}
          {queued > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">{queued} queued</span>
          )}
        </div>
        {hasFinished && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={clearFinishedAgents}
            title="Xoá lịch sử"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        {(running > 0 || queued > 0) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={cancelAllAgents}
          >
            Cancel all
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        {all.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center text-muted-foreground text-sm px-6">
            <Bot className="h-8 w-8 mb-2 opacity-50" />
            <p>Chưa có sub-agent nào.</p>
            <p className="text-xs mt-1">
              AI sẽ gọi <code className="px-1 bg-muted rounded">spawn_agent</code> khi muốn chia task song song.
            </p>
          </div>
        ) : (
          <div className="py-2">
            {roots.map((r) => (
              <AgentRow key={r.id} node={r} depth={0} childrenNodes={byParent} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
