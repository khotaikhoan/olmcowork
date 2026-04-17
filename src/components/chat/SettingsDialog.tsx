import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { pingOllama } from "@/lib/ollama";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (settings: SettingsValue) => void;
}

export interface SettingsValue {
  ollama_url: string;
  default_model: string | null;
  require_confirm: boolean;
  auto_stop_minutes: number;
  auto_start: boolean;
}

export function SettingsDialog({ open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const [url, setUrl] = useState("http://localhost:11434");
  const [model, setModel] = useState("");
  const [requireConfirm, setRequireConfirm] = useState(true);
  const [autoStopMinutes, setAutoStopMinutes] = useState(0);
  const [autoStart, setAutoStart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"unknown" | "ok" | "fail">("unknown");

  useEffect(() => {
    if (!open || !user) return;
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUrl(data.ollama_url);
          setModel(data.default_model ?? "");
          setRequireConfirm(data.require_confirm);
          setAutoStopMinutes((data as any).auto_stop_minutes ?? 0);
          setAutoStart((data as any).auto_start ?? true);
        }
      });
  }, [open, user]);

  const test = async () => {
    setStatus("unknown");
    const ok = await pingOllama(url);
    setStatus(ok ? "ok" : "fail");
    toast[ok ? "success" : "error"](
      ok ? "Đã kết nối Ollama" : "Không kết nối được Ollama (kiểm tra OLLAMA_ORIGINS=*)",
    );
  };

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const payload = {
      user_id: user.id,
      ollama_url: url,
      default_model: model || null,
      require_confirm: requireConfirm,
      auto_stop_minutes: autoStopMinutes,
      auto_start: autoStart,
    };
    const { error } = await supabase.from("user_settings").upsert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Đã lưu cài đặt");
    onSaved({
      ollama_url: url,
      default_model: model || null,
      require_confirm: requireConfirm,
      auto_stop_minutes: autoStopMinutes,
      auto_start: autoStart,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cài đặt</DialogTitle>
          <DialogDescription>
            Cấu hình kết nối tới Ollama trên máy bạn. Để cho phép trình duyệt truy cập, khởi động Ollama bằng{" "}
            <code className="px-1 bg-muted rounded">OLLAMA_ORIGINS=* ollama serve</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="url">URL Ollama</Label>
            <div className="flex gap-2">
              <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} />
              <Button variant="outline" onClick={test}>
                Kiểm tra
              </Button>
            </div>
            {status === "ok" && <p className="text-xs text-[hsl(var(--success))]">Đã kết nối ✓</p>}
            {status === "fail" && <p className="text-xs text-destructive">Kết nối thất bại</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Model mặc định (tuỳ chọn)</Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="vd. llama3.1:8b"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Yêu cầu xác nhận với công cụ rủi ro</Label>
              <p className="text-xs text-muted-foreground">
                Dùng cho công cụ điều khiển máy. Khuyến nghị: BẬT.
              </p>
            </div>
            <Switch checked={requireConfirm} onCheckedChange={setRequireConfirm} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auto-stop">Tự dừng Ollama sau khi nhàn rỗi (phút)</Label>
            <Input
              id="auto-stop"
              type="number"
              min={0}
              max={1440}
              value={autoStopMinutes}
              onChange={(e) => setAutoStopMinutes(Math.max(0, Number(e.target.value) || 0))}
            />
            <p className="text-xs text-muted-foreground">
              0 = tắt. Chỉ hoạt động trong ứng dụng desktop. Bộ đếm reset mỗi khi gửi tin nhắn.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Tự khởi động Ollama khi gửi tin nhắn</Label>
              <p className="text-xs text-muted-foreground">
                Nếu Ollama đang dừng, tự khởi động trước khi gửi. Chỉ trong ứng dụng desktop.
              </p>
            </div>
            <Switch checked={autoStart} onCheckedChange={setAutoStart} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={save} disabled={busy}>
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
