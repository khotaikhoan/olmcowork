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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { pingOllama } from "@/lib/ollama";
import { OPENAI_MODELS } from "@/lib/openai";
import { useTheme, Theme } from "@/hooks/useTheme";
import { Sun, Moon, Monitor, Clock, Activity as ActivityIcon, Brain, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FullAutoToggle } from "./FullAutoToggle";

export type Provider = "ollama" | "openai";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (settings: SettingsValue) => void;
}

export interface SettingsValue {
  provider: Provider;
  openai_model: string;
  ollama_url: string;
  default_model: string | null;
  require_confirm: boolean;
  auto_stop_minutes: number;
  auto_start: boolean;
}

const LS_PROVIDER = "chat.provider";
const LS_OPENAI_MODEL = "chat.openai_model";

export function SettingsDialog({ open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  const goTo = (path: string) => {
    onOpenChange(false);
    nav(path);
  };
  const [provider, setProvider] = useState<Provider>(
    (localStorage.getItem(LS_PROVIDER) as Provider) || "ollama",
  );
  const [openaiModel, setOpenaiModel] = useState<string>(
    localStorage.getItem(LS_OPENAI_MODEL) || "gpt-4o-mini",
  );
  const [url, setUrl] = useState("http://localhost:11434");
  const [model, setModel] = useState("");
  const [requireConfirm, setRequireConfirm] = useState(true);
  const [autoStopMinutes, setAutoStopMinutes] = useState(0);
  const [autoStart, setAutoStart] = useState(true);
  const [browserHeadless, setBrowserHeadless] = useState<boolean>(
    () => (typeof localStorage !== "undefined" ? localStorage.getItem("chat.browser_headless") !== "false" : true),
  );
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
    localStorage.setItem(LS_PROVIDER, provider);
    localStorage.setItem(LS_OPENAI_MODEL, openaiModel);
    localStorage.setItem("chat.browser_headless", String(browserHeadless));
    // Push headless mode to Electron bridge if available; safe no-op in browser.
    try { await (window as any).bridge?.browserSetHeadless?.(browserHeadless); } catch { /* ignore */ }
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
      provider,
      openai_model: openaiModel,
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
        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
          {/* Quick links to management pages */}
          <div className="space-y-1.5 rounded-md border border-border p-2">
            <Label className="px-1.5 text-xs text-muted-foreground uppercase tracking-wider">
              Quản lý
            </Label>
            {[
              { icon: Clock, label: "Scheduled agents", desc: "Lên lịch tác nhân tự động", path: "/schedules" },
              { icon: ActivityIcon, label: "Nhật ký hoạt động", desc: "Lịch sử công cụ đã chạy", path: "/activity" },
              { icon: Brain, label: "Bộ nhớ dài hạn", desc: "Sự kiện AI ghi nhớ về bạn", path: "/memories" },
            ].map(({ icon: Icon, label, desc, path }) => (
              <button
                key={path}
                type="button"
                onClick={() => goTo(path)}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors text-left group"
              >
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-muted-foreground truncate">{desc}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>

          <div className="space-y-2 rounded-md border border-border p-3">
            <Label>Giao diện</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "light" as Theme, label: "Sáng", Icon: Sun },
                { v: "dark" as Theme, label: "Tối", Icon: Moon },
                { v: "system" as Theme, label: "Hệ thống", Icon: Monitor },
              ]).map(({ v, label, Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTheme(v)}
                  className={
                    "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition-colors " +
                    (theme === v
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border hover:bg-muted/50 text-muted-foreground")
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 rounded-md border border-border p-3">
            <Label>Nhà cung cấp AI</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ollama">Ollama (cục bộ)</SelectItem>
                <SelectItem value="openai">OpenAI (đám mây)</SelectItem>
              </SelectContent>
            </Select>
            {provider === "openai" && (
              <div className="pt-2 space-y-2">
                <Label>Model OpenAI</Label>
                <Select value={openaiModel} onValueChange={setOpenaiModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPENAI_MODELS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Key đã lưu an toàn ở máy chủ. Tin nhắn sẽ gọi qua hàm <code>openai-chat</code>.
                </p>
              </div>
            )}
          </div>
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

          {/* Full Auto — agent loop tối đa 20 bước, không hỏi xác nhận. Esc để dừng. */}
          <FullAutoToggle />
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
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label>Trình duyệt hiển thị (headful)</Label>
              <p className="text-xs text-muted-foreground">
                Tắt = headless (ngầm, nhanh). Bật = mở cửa sổ Chrome để bạn xem AI làm gì. Đổi xong sẽ relaunch ở lần dùng tiếp theo.
              </p>
            </div>
            <Switch checked={!browserHeadless} onCheckedChange={(v) => setBrowserHeadless(!v)} />
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
