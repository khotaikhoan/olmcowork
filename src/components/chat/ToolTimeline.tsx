import { useState } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToolCallCard, ToolCallRecord } from "./ToolCallCard";

interface Props {
  calls: ToolCallRecord[];
  onReannotate?: () => void;
}

/**
 * Vertical timeline with a connector rail + animate-in for new steps.
 * Shows expand/collapse-all when there are 2+ steps.
 */
export function ToolTimeline({ calls, onReannotate }: Props) {
  const [expandKey, setExpandKey] = useState(0);
  const [forceState, setForceState] = useState<"open" | "closed" | null>(null);

  if (calls.length === 0) return null;

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
      {calls.map((tc, i) => (
        <div
          key={tc.id}
          className="relative animate-fade-in"
          style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
        >
          <ToolCallCard
            key={`${tc.id}-${expandKey}`}
            call={tc}
            defaultOpen={forceState === "open" ? true : forceState === "closed" ? false : undefined}
            onReannotate={onReannotate}
          />
        </div>
      ))}
    </div>
  );
}
