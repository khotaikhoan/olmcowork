import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  Terminal,
  FilePlus,
  Pencil,
  MousePointer2,
  Eye,
  Camera,
  Keyboard,
} from "lucide-react";
import { ToolDef } from "@/lib/tools";

interface Props {
  open: boolean;
  tool: ToolDef | null;
  args: Record<string, any> | null;
  onApprove: (alwaysAllow: boolean) => void;
  onDeny: () => void;
}

const RISK_STYLE = {
  low: { icon: ShieldCheck, label: "Rủi ro thấp", cls: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]" },
  medium: { icon: Shield, label: "Rủi ro trung bình", cls: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]" },
  high: { icon: ShieldAlert, label: "Rủi ro cao", cls: "bg-destructive/15 text-destructive" },
} as const;

/** Smart, action-aware preview of what the tool is about to do. */
function ActionPreview({ tool, args }: { tool: ToolDef; args: Record<string, any> }) {
  const action = String(args.action ?? "");

  // bash → terminal-like preview
  if (tool.name === "bash") {
    return (
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-b border-border">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground">Sắp chạy lệnh shell</span>
        </div>
        <pre className="bg-[hsl(30_8%_12%)] text-[hsl(36_18%_92%)] p-3 font-mono text-xs whitespace-pre-wrap break-all max-h-48 overflow-auto">
          <span className="text-[hsl(15_70%_70%)]">$ </span>
          {String(args.command ?? "")}
        </pre>
      </div>
    );
  }

  // text_editor — diff or new file preview
  if (tool.name === "text_editor") {
    if (action === "create") {
      return (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-b border-border">
            <FilePlus className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
            <span className="text-[11px] font-medium">Tạo mới</span>
            <code className="text-[11px] font-mono text-muted-foreground truncate">{args.path}</code>
          </div>
          <pre className="p-3 text-xs font-mono whitespace-pre-wrap max-h-56 overflow-auto bg-background">
            {String(args.file_text ?? "").slice(0, 4000)}
          </pre>
        </div>
      );
    }
    if (action === "str_replace") {
      return (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-b border-border">
            <Pencil className="h-3.5 w-3.5 text-[hsl(var(--warning))]" />
            <span className="text-[11px] font-medium">Sửa file</span>
            <code className="text-[11px] font-mono text-muted-foreground truncate">{args.path}</code>
          </div>
          <div className="p-2 space-y-1.5 bg-muted/10">
            <div>
              <div className="text-[10px] font-medium text-destructive mb-0.5">- Xoá</div>
              <pre className="p-2 rounded border border-destructive/30 bg-destructive/5 text-xs font-mono whitespace-pre-wrap max-h-28 overflow-auto">
                {String(args.old_str ?? "")}
              </pre>
            </div>
            <div>
              <div className="text-[10px] font-medium text-[hsl(var(--success))] mb-0.5">+ Thêm</div>
              <pre className="p-2 rounded border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5 text-xs font-mono whitespace-pre-wrap max-h-28 overflow-auto">
                {String(args.new_str ?? "")}
              </pre>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-b border-border">
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium">{action}</span>
          <code className="text-[11px] font-mono text-muted-foreground truncate">{args.path}</code>
        </div>
      </div>
    );
  }

  // computer / vision_click
  if (tool.name === "computer" || tool.name === "vision_click") {
    const Icon =
      action === "screenshot" ? Camera :
      action === "type" || action === "key" ? Keyboard :
      MousePointer2;
    return (
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 border-b border-border">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium">
            {tool.name === "vision_click" ? "Vision · " : ""}{action || tool.name}
          </span>
        </div>
        <div className="p-3 text-xs space-y-1">
          {args.text && (
            <div>
              <span className="text-muted-foreground">Gõ:</span>{" "}
              <code className="font-mono bg-muted px-1 rounded">"{String(args.text).slice(0, 120)}"</code>
            </div>
          )}
          {args.key && (
            <div>
              <span className="text-muted-foreground">Phím:</span>{" "}
              <kbd className="font-mono px-1.5 py-0.5 rounded bg-muted border border-border">{args.key}</kbd>
            </div>
          )}
          {args.coordinate && (
            <div>
              <span className="text-muted-foreground">Toạ độ:</span>{" "}
              <code className="font-mono">({args.coordinate[0]}, {args.coordinate[1]})</code>
            </div>
          )}
          {args.mark_id != null && (
            <div>
              <span className="text-muted-foreground">Mark:</span>{" "}
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-md bg-primary text-primary-foreground font-mono text-[11px] font-bold">
                #{args.mark_id}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // generic fallback → JSON
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="text-xs font-medium text-muted-foreground mb-1.5">Tham số</div>
      <ScrollArea className="max-h-60">
        <pre className="text-xs font-mono whitespace-pre-wrap break-all">
          {JSON.stringify(args, null, 2)}
        </pre>
      </ScrollArea>
    </div>
  );
}

export function ToolApprovalDialog({ open, tool, args, onApprove, onDeny }: Props) {
  if (!tool) return null;
  const r = RISK_STYLE[tool.risk];
  const Icon = r.icon;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${r.cls}`}>
              <Icon className="h-3 w-3" /> {r.label}
            </span>
            <Badge variant="outline" className="font-mono text-xs">
              {tool.name}
            </Badge>
          </div>
          <AlertDialogTitle>AI muốn thực thi một công cụ</AlertDialogTitle>
          <AlertDialogDescription>{tool.description}</AlertDialogDescription>
        </AlertDialogHeader>

        <ActionPreview tool={tool} args={args ?? {}} />

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onDeny}>Từ chối</AlertDialogCancel>
          {tool.risk !== "high" && (
            <Button variant="outline" onClick={() => onApprove(true)}>
              Cho phép & tự duyệt sau
            </Button>
          )}
          <AlertDialogAction onClick={() => onApprove(false)}>Cho phép một lần</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
