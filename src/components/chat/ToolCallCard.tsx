import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VisionMarksOverlay } from "./VisionMarksOverlay";
import type { VisionMark } from "@/lib/bridge";
import { InlineDiff } from "./InlineDiff";
import { CursorTrailOverlay, CursorPoint } from "./CursorTrailOverlay";

export type ToolCallStatus = "pending" | "approved" | "running" | "done" | "denied" | "error";

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, any>;
  status: ToolCallStatus;
  result?: string;
  /** base64 PNG (no data: prefix), set for computer.screenshot or vision_click.annotate */
  image?: string;
  /** accessibility marks, set for vision_click.annotate */
  marks?: VisionMark[];
  /** ordered cursor waypoints when this call is part of a computer-use sequence */
  trailPoints?: CursorPoint[];
}

function variant(call: ToolCallRecord) {
  const a = String(call.args.action ?? "");
  if (call.name === "bash") return { kind: "bash" as const, icon: Terminal, label: "bash" };
  if (call.name === "computer") {
    if (a === "screenshot") return { kind: "screenshot" as const, icon: Camera, label: "screenshot" };
    if (a === "type") return { kind: "computer" as const, icon: Keyboard, label: "type text" };
    if (a === "key") return { kind: "computer" as const, icon: Keyboard, label: `key: ${call.args.key}` };
    return { kind: "computer" as const, icon: MousePointer2, label: a || "computer" };
  }
  if (call.name === "vision_click") {
    if (a === "annotate") return { kind: "vision" as const, icon: Eye, label: "annotate UI" };
    if (a === "click") return { kind: "computer" as const, icon: MousePointer2, label: `click #${call.args.mark_id}` };
    return { kind: "computer" as const, icon: MousePointer2, label: a || "vision" };
  }
  if (call.name === "text_editor") {
    if (a === "view") return { kind: "view" as const, icon: Eye, label: "view file" };
    if (a === "list_dir") return { kind: "view" as const, icon: Folder, label: "list dir" };
    if (a === "create") return { kind: "create" as const, icon: FilePlus, label: "create file" };
    if (a === "str_replace") return { kind: "edit" as const, icon: Pencil, label: "edit file" };
    return { kind: "view" as const, icon: FileText, label: a };
  }
  return { kind: "generic" as const, icon: Wrench, label: call.name };
}

function StatusBadge({ status }: { status: ToolCallStatus }) {
  const map: Record<ToolCallStatus, { icon: JSX.Element; label: string; cls: string }> = {
    pending: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Chờ duyệt", cls: "text-[hsl(var(--warning))]" },
    approved: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Đang chạy", cls: "text-primary" },
    running: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Đang chạy", cls: "text-primary" },
    done: { icon: <CheckCircle2 className="h-3 w-3" />, label: "Hoàn thành", cls: "text-[hsl(var(--success))]" },
    denied: { icon: <XCircle className="h-3 w-3" />, label: "Từ chối", cls: "text-muted-foreground" },
    error: { icon: <XCircle className="h-3 w-3" />, label: "Lỗi", cls: "text-destructive" },
  };
  const s = map[status];
  return (
    <div className={cn("flex items-center gap-1 text-[11px] font-medium", s.cls)}>
      {s.icon}
      <span>{s.label}</span>
    </div>
  );
}

export function ToolCallCard({
  call,
  defaultOpen,
  onReannotate,
}: {
  call: ToolCallRecord;
  defaultOpen?: boolean;
  onReannotate?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const v = variant(call);
  const Icon = v.icon;

  // Header summary line (shows the most useful arg inline)
  const summary = (() => {
    if (call.name === "bash") return String(call.args.command ?? "").slice(0, 80);
    if (call.name === "text_editor") return String(call.args.path ?? "");
    if (call.name === "computer" && call.args.coordinate)
      return `(${call.args.coordinate[0]}, ${call.args.coordinate[1]})`;
    if (call.name === "computer" && call.args.text)
      return `"${String(call.args.text).slice(0, 60)}"`;
    return "";
  })();

  return (
    <div className="my-2 rounded-xl border border-border bg-card overflow-hidden shadow-[var(--shadow-soft)]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/40 transition"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <span className="font-mono text-xs text-foreground/80">{v.label}</span>
        {summary && (
          <span className="font-mono text-[11px] text-muted-foreground truncate max-w-[40ch]">
            {summary}
          </span>
        )}
        <div className="ml-auto">
          <StatusBadge status={call.status} />
        </div>
      </button>

      {open && (
        <div className="border-t border-border">
          {/* Bash → terminal style */}
          {v.kind === "bash" && (
            <div className="bg-[hsl(30_8%_12%)] text-[hsl(36_18%_92%)] p-3 font-mono text-xs">
              <div className="text-[hsl(15_70%_70%)]">$ {String(call.args.command ?? "")}</div>
              {call.result && (
                <pre className="mt-2 whitespace-pre-wrap max-h-72 overflow-auto opacity-90">
                  {call.result}
                </pre>
              )}
            </div>
          )}

          {/* Vision annotate → interactive overlay */}
          {v.kind === "vision" && (
            <div className="p-3 space-y-2 bg-muted/20">
              {call.image && call.marks ? (
                <VisionMarksOverlay image={call.image} marks={call.marks} onReannotate={onReannotate} />
              ) : call.image ? (
                <img
                  src={`data:image/png;base64,${call.image}`}
                  alt="annotated"
                  className="rounded-md border border-border max-h-96 w-auto"
                />
              ) : (
                <div className="text-xs text-muted-foreground">{call.result ?? "Đang phân tích…"}</div>
              )}
              {call.marks && (
                <div className="text-[11px] text-muted-foreground">
                  Đã phát hiện <span className="font-mono text-foreground">{call.marks.length}</span> phần tử có thể tương tác. Click vào ảnh để xem nhãn.
                </div>
              )}
            </div>
          )}

          {/* Screenshot → thumbnail */}
          {v.kind === "screenshot" && (
            <div className="p-3 space-y-2 bg-muted/20">
              {call.image ? (
                <img
                  src={`data:image/png;base64,${call.image}`}
                  alt="screenshot"
                  className="rounded-md border border-border max-h-96 w-auto"
                />
              ) : (
                <div className="text-xs text-muted-foreground">{call.result ?? "Đang chụp…"}</div>
              )}
            </div>
          )}

          {/* File create → show new content */}
          {v.kind === "create" && (
            <div className="bg-muted/20">
              <div className="px-3 pt-2 text-[11px] font-medium text-muted-foreground">
                Nội dung mới ({String(call.args.file_text ?? "").length} ký tự)
              </div>
              <pre className="mx-3 mb-3 mt-1 p-2 rounded-md border border-border bg-background text-xs font-mono overflow-auto max-h-72 whitespace-pre">
                {String(call.args.file_text ?? "").slice(0, 3000)}
              </pre>
              {call.result && (
                <div className="px-3 pb-3 text-[11px] text-muted-foreground">{call.result}</div>
              )}
            </div>
          )}

          {/* File edit → mini diff */}
          {v.kind === "edit" && (
            <div className="bg-muted/20 p-3 space-y-2">
              <div>
                <div className="text-[11px] font-medium text-destructive mb-1">- Cũ</div>
                <pre className="p-2 rounded-md border border-destructive/30 bg-destructive/5 text-xs font-mono overflow-auto max-h-40 whitespace-pre">
                  {String(call.args.old_str ?? "")}
                </pre>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[hsl(var(--success))] mb-1">+ Mới</div>
                <pre className="p-2 rounded-md border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5 text-xs font-mono overflow-auto max-h-40 whitespace-pre">
                  {String(call.args.new_str ?? "")}
                </pre>
              </div>
              {call.result && (
                <div className="text-[11px] text-muted-foreground">{call.result}</div>
              )}
            </div>
          )}

          {/* View / list → just show result */}
          {v.kind === "view" && (
            <div className="bg-muted/20 p-3">
              <div className="text-[11px] text-muted-foreground mb-1 font-mono">
                {String(call.args.path ?? "")}
              </div>
              <pre className="p-2 rounded-md border border-border bg-background text-xs font-mono overflow-auto max-h-72 whitespace-pre">
                {call.result ?? "…"}
              </pre>
            </div>
          )}

          {/* Computer non-screenshot */}
          {v.kind === "computer" && (
            <div className="bg-muted/20 p-3 space-y-2">
              <pre className="p-2 rounded-md border border-border bg-background text-xs font-mono overflow-auto max-h-40">
                {JSON.stringify(call.args, null, 2)}
              </pre>
              {call.result && (
                <div className="text-[11px] text-muted-foreground">{call.result}</div>
              )}
            </div>
          )}

          {v.kind === "generic" && (
            <div className="bg-muted/20 p-3 space-y-2">
              <pre className="p-2 rounded-md border border-border bg-background text-xs font-mono overflow-auto max-h-40">
                {JSON.stringify(call.args, null, 2)}
              </pre>
              {call.result && (
                <pre className="p-2 rounded-md border border-border bg-background text-xs font-mono overflow-auto max-h-60 whitespace-pre-wrap">
                  {call.result}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
