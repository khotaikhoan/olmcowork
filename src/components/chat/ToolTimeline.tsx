import { useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolCallCard, ToolCallRecord } from "./ToolCallCard";

interface Props {
  calls: ToolCallRecord[];
  onReannotate?: () => void;
  /** Assistant message text that precedes these tool calls — used for "Why?" explainer */
  precedingText?: string;
}

interface Group {
  /** index of the original call in the input array, used as key */
  startId: string;
  calls: ToolCallRecord[];
  groupName?: string;
}

/** Collapse runs of ≥3 consecutive calls with the same name+action into one group. */
function groupCalls(calls: ToolCallRecord[]): Group[] {
  const out: Group[] = [];
  let i = 0;
  const sig = (c: ToolCallRecord) =>
    `${c.name}:${(c.args && (c.args as any).action) ?? ""}`;
  while (i < calls.length) {
    const start = i;
    const s = sig(calls[i]);
    while (i < calls.length && sig(calls[i]) === s) i++;
    const run = calls.slice(start, i);
    if (run.length >= 3) {
      out.push({ startId: run[0].id, calls: run, groupName: s });
    } else {
      for (const c of run) out.push({ startId: c.id, calls: [c] });
    }
  }
  return out;
}

function GroupCard({
  group,
  defaultOpen,
  onReannotate,
}: {
  group: Group;
  defaultOpen?: boolean;
  onReannotate?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const label = (group.groupName ?? "tool").replace(":", " · ");
  const okCount = group.calls.filter((c) => c.status === "done").length;
  return (
    <div className="my-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-primary/10 transition"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-primary" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-primary" />
        )}
        <span className="font-mono text-xs font-medium text-primary">
          📂 {label} × {group.calls.length}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {okCount}/{group.calls.length} done
        </span>
      </button>
      {open && (
        <div className="border-t border-primary/20 p-2 space-y-1">
          {group.calls.map((c) => (
            <ToolCallCard key={c.id} call={c} defaultOpen={false} onReannotate={onReannotate} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Vertical timeline with a connector rail + animate-in for new steps.
 * Groups ≥3 consecutive calls of same name+action into one expandable card.
 */
export function ToolTimeline({ calls, onReannotate }: Props) {
  const [expandKey, setExpandKey] = useState(0);
  const [forceState, setForceState] = useState<"open" | "closed" | null>(null);

  if (calls.length === 0) return null;

  const groups = groupCalls(calls);

  const expandAll = () => {
    setForceState("open");
    setExpandKey((k) => k + 1);
  };
  const collapseAll = () => {
    setForceState("closed");
    setExpandKey((k) => k + 1);
  };

  return (
    <div className="w-full min-w-[300px] relative">
      {calls.length > 1 && (
        <>
          <div className="absolute left-[15px] top-4 bottom-4 w-px bg-gradient-to-b from-primary/40 via-border to-border" />
          <div className="flex justify-end gap-1 mb-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={expandAll}
            >
              <ChevronsUpDown className="h-3 w-3 mr-1" /> Mở tất cả
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={collapseAll}
            >
              <ChevronsDownUp className="h-3 w-3 mr-1" /> Thu gọn
            </Button>
          </div>
        </>
      )}
      {groups.map((g, i) => (
        <div
          key={g.startId}
          className="relative animate-fade-in"
          style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
        >
          {g.calls.length >= 3 ? (
            <GroupCard
              key={`${g.startId}-${expandKey}`}
              group={g}
              defaultOpen={forceState === "open"}
              onReannotate={onReannotate}
            />
          ) : (
            <ToolCallCard
              key={`${g.calls[0].id}-${expandKey}`}
              call={g.calls[0]}
              defaultOpen={
                forceState === "open" ? true : forceState === "closed" ? false : undefined
              }
              onReannotate={onReannotate}
            />
          )}
        </div>
      ))}
    </div>
  );
}
