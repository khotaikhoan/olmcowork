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
import { ShieldAlert, ShieldCheck, Shield } from "lucide-react";
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

export function ToolApprovalDialog({ open, tool, args, onApprove, onDeny }: Props) {
  if (!tool) return null;
  const r = RISK_STYLE[tool.risk];
  const Icon = r.icon;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-1">
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

        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Tham số</div>
          <ScrollArea className="max-h-60">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(args ?? {}, null, 2)}
            </pre>
          </ScrollArea>
        </div>

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
