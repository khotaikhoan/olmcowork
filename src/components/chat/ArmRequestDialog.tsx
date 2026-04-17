// Dialog shown when AI calls a tool that requires armed-mode but the user
// has not armed yet. The user must explicitly approve to grant a 5-minute
// window. Denial cancels the tool call.
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
import { ShieldAlert } from "lucide-react";
import { ARMED_DURATION_MS } from "@/lib/armed";

interface Props {
  open: boolean;
  toolName: string | null;
  reason?: string;
  onApprove: () => void;
  onDeny: () => void;
}

export function ArmRequestDialog({ open, toolName, reason, onApprove, onDeny }: Props) {
  const minutes = Math.round(ARMED_DURATION_MS / 60000);

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-destructive/15 text-destructive border-destructive/40 inline-flex items-center gap-1">
              <ShieldAlert className="h-3 w-3" /> Cực kỳ rủi ro
            </Badge>
            {toolName && (
              <Badge variant="outline" className="font-mono text-xs">{toolName}</Badge>
            )}
          </div>
          <AlertDialogTitle>AI yêu cầu mở khoá deep-system access</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 pt-1">
            <span className="block">
              Cho phép nghĩa là trong <strong>{minutes} phút</strong> tới, agent có thể:
            </span>
            <ul className="list-disc pl-5 text-xs space-y-1">
              <li><code className="text-foreground">sudo_shell</code> — chạy lệnh quyền root (Touch ID/Windows Hello mỗi lần).</li>
              <li><code className="text-foreground">run_script</code> — AppleScript / PowerShell / bash bất kỳ (gửi email, automation hệ thống).</li>
              <li><code className="text-foreground">raw_file</code> — đọc/ghi file ngoài allowed_paths (vẫn chặn /System, /etc/sudoers, ~/.ssh/id_*, registry HKLM).</li>
            </ul>
            {reason && (
              <span className="block text-xs italic border-l-2 border-border pl-2 text-muted-foreground">
                Lý do AI đưa ra: {reason}
              </span>
            )}
            <span className="block text-xs">
              Bạn có thể disarm sớm bằng nút <code>ARMED</code> ở thanh trên cùng.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDeny}>Từ chối</AlertDialogCancel>
          <AlertDialogAction
            onClick={onApprove}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            Arm {minutes} phút
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
