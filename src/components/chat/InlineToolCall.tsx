import { useState } from "react";
import {
  Terminal,
  FileText,
  Eye,
  Pencil,
  FilePlus,
  Folder,
  Camera,
  MousePointer2,
  Keyboard,
  CheckCircle2,
  XCircle,
  Loader2,
  Wrench,
  Globe,
  Search,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCallRecord, ToolCallStatus } from "./ToolCallCard";
import { ToolCallCard } from "./ToolCallCard";

function pickIcon(call: ToolCallRecord) {
  const a = String(call.args.action ?? "");
  if (call.name === "bash") return Terminal;
  if (call.name === "computer") {
    if (a === "screenshot") return Camera;
    if (a === "type" || a === "key") return Keyboard;
    return MousePointer2;
  }
  if (call.name === "vision_click") return a === "annotate" ? Eye : MousePointer2;
  if (call.name === "text_editor") {
    if (a === "create") return FilePlus;
    if (a === "str_replace") return Pencil;
    if (a === "list_dir") return Folder;
    return FileText;
  }
  if (call.name === "fetch_url") return Globe;
  if (call.name === "web_search") return Search;
  return Wrench;
}

function pickLabel(call: ToolCallRecord) {
  const a = String(call.args.action ?? "");
  if (call.name === "bash") return "bash";
  if (call.name === "computer") return a || "computer";
  if (call.name === "vision_click") return a === "annotate" ? "annotate" : a || "vision";
  if (call.name === "text_editor") return a || "edit";
  if (call.name === "fetch_url") return "fetch";
  if (call.name === "web_search") return "search";
  return call.name;
}

function pickSummary(call: ToolCallRecord): string {
  if (call.name === "bash") return String(call.args.command ?? "");
  if (call.name === "text_editor") return String(call.args.path ?? "");
  if (call.name === "fetch_url") return String(call.args.url ?? "");
  if (call.name === "web_search") return String(call.args.query ?? "");
  if (call.name === "computer") {
    if (call.args.text) return `"${String(call.args.text).slice(0, 60)}"`;
    if (call.args.coordinate) return `(${call.args.coordinate[0]}, ${call.args.coordinate[1]})`;
    return String(call.args.action ?? "");
  }
  if (call.name === "vision_click" && call.args.mark_id != null) return `#${call.args.mark_id}`;
  return "";
}

function StatusIcon({ status }: { status: ToolCallStatus }) {
  const cls = "h-3 w-3 shrink-0";
  if (status === "done") return <CheckCircle2 className={cn(cls, "text-[hsl(var(--success))]")} />;
  if (status === "error") return <XCircle className={cn(cls, "text-destructive")} />;
  if (status === "denied") return <XCircle className={cn(cls, "text-muted-foreground")} />;
  return <Loader2 className={cn(cls, "animate-spin text-primary")} />;
}

/** Inline preview snippet — shown next to the header without expanding. */
function InlinePreview({ call }: { call: ToolCallRecord }) {
  // Screenshot / vision → tiny thumbnail.
  if (call.image && (call.name === "computer" || call.name === "vision_click")) {
    return (
      <img
        src={`data:image/png;base64,${call.image}`}
        alt=""
        className="h-10 w-16 rounded-md border border-border object-cover shrink-0"
      />
    );
  }

  // bash → first line of result.
  if (call.name === "bash" && call.result) {
    const firstLine = call.result.split("\n").find((l) => l.trim()) ?? "";
    if (firstLine) {
      return (
        <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[180px] hidden sm:inline">
          → {firstLine.slice(0, 60)}
        </span>
      );
    }
  }

  // file edit → "+N -M" diff stats.
  if (call.name === "text_editor" && String(call.args.action) === "str_replace") {
    const oldLines = String(call.args.old_str ?? "").split("\n").length;
    const newLines = String(call.args.new_str ?? "").split("\n").length;
    return (
      <span className="font-mono text-[10px] tabular-nums shrink-0">
        <span className="text-[hsl(var(--success))]">+{newLines}</span>{" "}
        <span className="text-destructive">−{oldLines}</span>
      </span>
    );
  }

  return null;
}

interface Props {
  call: ToolCallRecord;
  precedingText?: string;
  onReannotate?: () => void;
  onRetry?: () => void;
}

/**
 * Compact inline tool call — one row with icon + label + summary + preview.
 * Click to expand the full ToolCallCard with all details.
 */
export function InlineToolCall({ call, precedingText, onReannotate, onRetry }: Props) {
  const [open, setOpen] = useState(false);
  const Icon = pickIcon(call);
  const label = pickLabel(call);
  const summary = pickSummary(call);
  const showRetry = !!onRetry && call.status === "error";

  if (open) {
    return (
      <div className="my-1 animate-fade-in">
        <button
          onClick={() => setOpen(false)}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition"
        >
          <ChevronDown className="h-3 w-3" /> Thu gọn
        </button>
        <ToolCallCard
          call={call}
          defaultOpen
          onReannotate={onReannotate}
          precedingText={precedingText}
          onRetry={onRetry}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "my-1 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted/40 transition cursor-pointer group animate-fade-in",
        call.status === "error" && "border-destructive/40 bg-destructive/5",
      )}
      onClick={() => setOpen(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
      }}
    >
      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 group-hover:text-foreground transition" />
      <div className="h-5 w-5 rounded bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-3 w-3 text-muted-foreground" />
      </div>
      <span className="font-mono text-[11px] font-medium text-foreground/80 shrink-0">
        {label}
      </span>
      {summary && (
        <span className="font-mono text-[11px] text-muted-foreground truncate min-w-0 flex-1">
          {summary}
        </span>
      )}
      {!summary && <span className="flex-1 min-w-0" />}
      <InlinePreview call={call} />
      {showRetry && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRetry!();
          }}
          title="Thử lại"
          aria-label="Thử lại"
          className="h-5 w-5 rounded flex items-center justify-center text-destructive hover:bg-destructive/10 transition shrink-0"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      )}
      <StatusIcon status={call.status} />
    </div>
  );
}
