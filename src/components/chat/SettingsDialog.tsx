import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Loader2, AlertTriangle } from "lucide-react";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { pingOllama } from "@/lib/ollama";
import { OPENAI_MODELS } from "@/lib/openai";
import {
  Clock, Activity as ActivityIcon, Brain, ChevronRight, ListChecks,
  Cpu, ShieldCheck, Laptop,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { FullAutoToggle } from "./FullAutoToggle";
import { isElectron } from "@/lib/bridge";
import {
  isSoundEnabled, setSoundEnabled,
  isBackgroundOnly, setBackgroundOnly,
  playSound,
} from "@/lib/sounds";

export type Provider = "ollama" | "openai";

const IS_DESKTOP = isElectron();

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
  const nav = useNavigate();
  const goTo = (path: string) => {
    onOpenChange(false);
    nav(path);
  };
  const [provider, setProvider] = useState<Provider>(() => {
    const saved = (localStorage.getItem(LS_PROVIDER) as Provider) || "ollama";
    // Web preview không gọi được Ollama → ép sang openai.
    return !IS_DESKTOP && saved === "ollama" ? "openai" : saved;
  });
  const [openaiModel, setOpenaiModel] = useState<string>(
    localStorage.getItem(LS_OPENAI_MODEL) || "gpt-4o-mini",
  );
  const [url, setUrl] = useState("http://localhost:11434");
  const [model, setModel] = useState("");
  const [requireConfirm, setRequireConfirm] = useState(true);
  const [autoStopMinutes, setAutoStopMinutes] = useState(0);
  const [autoStart, setAutoStart] = useState(true);
  const [browserHeadless, setBrowserHeadless] = useState<boolean>(
    () => (typeof localStorage !== "undefined" ? localStorage.getItem("chat.browser_headless") === "true" : false),
  );
  const [browserUseRealProfile, setBrowserUseRealProfile] = useState<boolean>(
    () => (typeof localStorage !== "undefined" ? localStorage.getItem("chat.browser_use_real_profile") === "1" : false),
  );
  const [autoInstallUpdate, setAutoInstallUpdate] = useState<boolean>(
    () => (typeof localStorage !== "undefined" ? localStorage.getItem("chat.auto_install_update") === "1" : false),
  );
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => isSoundEnabled());
  const [soundBgOnly, setSoundBgOnlyState] = useState<boolean>(() => isBackgroundOnly());
  const [openSections, setOpenSections] = useState<string[]>(() => {
    if (typeof localStorage === "undefined") return ["ai"];
    try {
      const raw = localStorage.getItem("chat.settings_open_sections");
      if (raw === null) return ["ai"]; // first-time default
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : ["ai"];
    } catch {
      return ["ai"];
    }
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"unknown" | "ok" | "fail">("unknown");
  // Chrome quit-confirmation state for the "real profile" toggle.
  const [chromeDialogOpen, setChromeDialogOpen] = useState(false);
  const [chromeCount, setChromeCount] = useState(0);
  const [quittingChrome, setQuittingChrome] = useState(false);

  const handleToggleRealProfile = async (next: boolean) => {
    // Turning OFF — no detection needed.
    if (!next) { setBrowserUseRealProfile(false); return; }
    const bridge = (window as any).bridge;
    // Web preview (no Electron) — just flip the switch; bridge call is a no-op on save.
    if (!bridge?.chromeDebugProbe) { setBrowserUseRealProfile(true); return; }
    try {
      // Probe CDP debug port first. If Chrome was already started with
      // --remote-debugging-port=9222, we can attach without touching it.
      const probe = await bridge.chromeDebugProbe();
      if (probe?.ready) {
        setBrowserUseRealProfile(true);
        toast.success("Đã kết nối CDP — AI sẽ mở tab mới trong Chrome đang chạy.");
        return;
      }
      // Chrome may or may not be running, but debug port is OFF.
      // Show the relaunch dialog (graceful quit + restart with debug flag).
      const det = await bridge.chromeDetect?.();
      setChromeCount(Number(det?.count) || 0);
      setChromeDialogOpen(true);
    } catch {
      setBrowserUseRealProfile(true);
    }
  };

  const handleRelaunchChrome = async () => {
    const bridge = (window as any).bridge;
    if (!bridge?.chromeRelaunchWithDebug) return;
    setQuittingChrome(true);
    try {
      const r = await bridge.chromeRelaunchWithDebug();
      if (r?.ok) {
        toast.success("Chrome đã restart với debug port — tabs cũ đang khôi phục.");
        setBrowserUseRealProfile(true);
        setChromeDialogOpen(false);
      } else {
        toast.error(r?.output ?? "Không relaunch được Chrome.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Không relaunch được Chrome.");
    } finally {
      setQuittingChrome(false);
    }
  };

  const handleQuitChrome = async (force: boolean) => {
    const bridge = (window as any).bridge;
    if (!bridge?.chromeQuit) return;
    setQuittingChrome(true);
    try {
      const r = await bridge.chromeQuit(force);
      if (r?.ok) {
        toast.success("Đã thoát Chrome — bật profile thật.");
        setBrowserUseRealProfile(true);
        setChromeDialogOpen(false);
      } else {
        toast.error(r?.output ?? "Không thoát được Chrome — thử Force quit.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Không thoát được Chrome.");
    } finally {
      setQuittingChrome(false);
    }
  };

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
      ok
        ? "Đã kết nối Ollama"
        : "Không kết nối được Ollama (kiểm tra Ollama đang chạy, OLLAMA_ORIGINS=* trong trình duyệt; macOS Apple Silicon + Homebrew: thử GGML_METAL_TENSOR_DISABLE=1)",
    );
  };

  const save = async () => {
    if (!user) return;
    setBusy(true);
    localStorage.setItem(LS_PROVIDER, provider);
    localStorage.setItem(LS_OPENAI_MODEL, openaiModel);
    localStorage.setItem("chat.browser_headless", String(browserHeadless));
    localStorage.setItem("chat.browser_use_real_profile", browserUseRealProfile ? "1" : "0");
    localStorage.setItem("chat.auto_install_update", autoInstallUpdate ? "1" : "0");
    // Push browser settings to Electron bridge if available; safe no-op in browser.
    try { await (window as any).bridge?.browserSetHeadless?.(browserHeadless); } catch { /* ignore */ }
    try { await (window as any).bridge?.browserSetUseRealProfile?.(browserUseRealProfile); } catch { /* ignore */ }
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
            Thiết lập nhanh theo từng nhóm: AI, an toàn, desktop/control và trình duyệt.
          </DialogDescription>
        </DialogHeader>
        <div className="py-1 max-h-[70vh] overflow-y-auto pr-1">
          {/* Quick links to management pages — luôn hiện trên cùng */}
          <div className="space-y-1 rounded-md border border-border p-2 mb-3">
            <Label className="px-1.5 text-xs text-muted-foreground uppercase tracking-wider">
              Quản lý
            </Label>
            {[
              { icon: Clock, label: "Scheduled agents", desc: "Lên lịch tác nhân tự động", path: "/schedules" },
              { icon: ActivityIcon, label: "Nhật ký hoạt động", desc: "Lịch sử công cụ đã chạy", path: "/activity" },
              { icon: ListChecks, label: "Lịch sử Plan", desc: "Các plan đã approve trong Control mode", path: "/plans" },
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

          <Accordion
            type="multiple"
            value={openSections}
            onValueChange={(v) => {
              setOpenSections(v);
              try { localStorage.setItem("chat.settings_open_sections", JSON.stringify(v)); } catch { /* ignore */ }
            }}
            className="space-y-2"
          >
            {/* Giao diện đã có ở ngoài (ThemeToggle) — bỏ khỏi Settings để tránh trùng lặp. */}

            {/* ── AI & Model ─────────────────────────────────────────── */}
            <AccordionItem value="ai" className="border rounded-md px-3">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Cpu className="h-4 w-4 text-muted-foreground" /> AI &amp; Model
                  <span className="text-xs font-normal text-muted-foreground">
                    · {provider === "openai" ? "OpenAI" : "Ollama"}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-3">
                <div className="text-xs text-muted-foreground">
                  Chọn nhà cung cấp và model mặc định. Có thể đổi bất kỳ lúc nào trên TopBar.
                </div>
                <div className="space-y-2">
                  <Label>Nhà cung cấp AI</Label>
                  <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IS_DESKTOP && <SelectItem value="ollama">Ollama (cục bộ)</SelectItem>}
                      <SelectItem value="openai">OpenAI (đám mây)</SelectItem>
                    </SelectContent>
                  </Select>
                  {!IS_DESKTOP && (
                    <p className="text-xs text-muted-foreground">
                      Ollama chỉ hoạt động trong Desktop app. Web preview chỉ hỗ trợ OpenAI.
                    </p>
                  )}
                </div>

                {provider === "openai" && (
                  <div className="space-y-2">
                    <Label>Model OpenAI</Label>
                    <Select value={openaiModel} onValueChange={setOpenaiModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {OPENAI_MODELS.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Key đã lưu an toàn ở máy chủ. Tin nhắn sẽ gọi qua hàm <code>openai-chat</code>.
                    </p>
                  </div>
                )}

                {provider === "ollama" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="url">URL Ollama</Label>
                      <div className="flex gap-2">
                        <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} />
                        <Button variant="outline" onClick={test}>Kiểm tra</Button>
                      </div>
                      {status === "ok" && <p className="text-xs text-[hsl(var(--success))]">Đã kết nối ✓</p>}
                      {status === "fail" && <p className="text-xs text-destructive">Kết nối thất bại</p>}
                      <details className="rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
                        <summary className="cursor-pointer select-none font-medium text-foreground/80">
                          Troubleshooting (ngắn gọn)
                        </summary>
                        <div className="mt-2 space-y-2 leading-relaxed">
                          <div>
                            - **Trình duyệt/web** cần CORS:
                            <code className="ml-1 px-1 bg-muted rounded">OLLAMA_ORIGINS=* ollama serve</code>
                          </div>
                          <div>
                            - **macOS Apple Silicon + Ollama Homebrew** lỗi HTTP 500 khi tải model:
                            <code className="ml-1 px-1 bg-muted rounded">GGML_METAL_TENSOR_DISABLE=1</code>
                            <span className="ml-1">khi chạy</span>
                            <code className="ml-1 px-1 bg-muted rounded">ollama serve</code>
                            <span className="ml-1">(Desktop app có thể tự đặt biến này khi bấm khởi động Ollama).</span>
                          </div>
                        </div>
                      </details>
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
                  </>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ── An toàn & Tự động hoá ──────────────────────────────── */}
            <AccordionItem value="safety" className="border rounded-md px-3">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" /> An toàn &amp; Tự động hoá
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label>Yêu cầu xác nhận với công cụ rủi ro</Label>
                    <p className="text-xs text-muted-foreground">
                      Dùng cho công cụ điều khiển máy. Khuyến nghị: BẬT.
                    </p>
                  </div>
                  <Switch checked={requireConfirm} onCheckedChange={setRequireConfirm} />
                </div>
                {/* Full Auto — agent loop tối đa 20 bước, không hỏi xác nhận. Esc để dừng. */}
                <FullAutoToggle />
              </AccordionContent>
            </AccordionItem>

            {/* ── Desktop app ────────────────────────────────────────── */}
            <AccordionItem value="desktop" className="border rounded-md px-3">
              <AccordionTrigger className="hover:no-underline py-3">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Laptop className="h-4 w-4 text-muted-foreground" /> Desktop &amp; Control
                  <span className="text-xs font-normal text-muted-foreground">· tự động hoá + cập nhật</span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-3">
                {!IS_DESKTOP && (
                  <div className="text-xs text-muted-foreground">
                    Một số mục chỉ hoạt động trên Desktop app (Ollama/control/browser automation).
                  </div>
                )}

                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="text-xs font-medium text-foreground/80 mb-1">Ollama (desktop)</div>
                <div className="space-y-2">
                  <Label htmlFor="auto-stop">Tự dừng sau nhàn rỗi (phút)</Label>
                  <Input
                    id="auto-stop"
                    type="number"
                    min={0}
                    max={1440}
                    value={autoStopMinutes}
                    onChange={(e) => setAutoStopMinutes(Math.max(0, Number(e.target.value) || 0))}
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = tắt. Reset khi có hoạt động.
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label>Tự khởi động Ollama khi gửi tin nhắn</Label>
                    <p className="text-xs text-muted-foreground">Giúp “bấm là chạy” trong Control.</p>
                  </div>
                  <Switch checked={autoStart} onCheckedChange={setAutoStart} />
                </div>
                </div>

                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="text-xs font-medium text-foreground/80 mb-1">Browser automation</div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label>Trình duyệt hiển thị (headful)</Label>
                    <p className="text-xs text-muted-foreground">Bật để quan sát AI thao tác.</p>
                  </div>
                  <Switch checked={!browserHeadless} onCheckedChange={(v) => setBrowserHeadless(!v)} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning/5 p-2 mt-2">
                  <div className="min-w-0">
                    <Label>Dùng profile Chrome thật của bạn</Label>
                    <p className="text-xs text-muted-foreground">
                      Dùng cookies/login sẵn. Cần đóng Chrome (Cmd+Q) khi bật lần đầu.
                    </p>
                  </div>
                  <Switch checked={browserUseRealProfile} onCheckedChange={handleToggleRealProfile} />
                </div>
                </div>

                <div className="rounded-md border border-border bg-muted/20 p-2">
                  <div className="text-xs font-medium text-foreground/80 mb-1">Cập nhật</div>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label>Tự động cài bản update khi tải xong</Label>
                    <p className="text-xs text-muted-foreground">
                      Tải xong sẽ yêu cầu khởi động lại để áp dụng.
                    </p>
                  </div>
                  <Switch checked={autoInstallUpdate} onCheckedChange={setAutoInstallUpdate} />
                </div>
                </div>

                {/* ── Hiệu ứng âm thanh ───────────────────────────────── */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label>Hiệu ứng âm thanh</Label>
                    <p className="text-xs text-muted-foreground">
                      Phát tiếng nhẹ khi gửi tin và khi AI trả lời xong.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button" size="sm" variant="ghost"
                      onClick={() => playSound("ting", { force: true })}
                    >
                      Test
                    </Button>
                    <Switch
                      checked={soundEnabled}
                      onCheckedChange={(v) => { setSoundEnabledState(v); setSoundEnabled(v); }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 pl-3 border-l-2 border-muted">
                  <div className="min-w-0">
                    <Label className={!soundEnabled ? "text-muted-foreground" : ""}>
                      Chỉ phát khi tab ở chế độ nền
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Tự động im lặng khi bạn đang nhìn vào tab này — chỉ kêu khi tab bị ẩn,
                      cửa sổ bị thu nhỏ, hoặc bạn đang ở app khác.
                    </p>
                  </div>
                  <Switch
                    checked={soundBgOnly}
                    disabled={!soundEnabled}
                    onCheckedChange={(v) => { setSoundBgOnlyState(v); setBackgroundOnly(v); }}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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

      {/* Relaunch-Chrome dialog — shown when "real profile" is enabled but CDP debug port is OFF. */}
      <AlertDialog open={chromeDialogOpen} onOpenChange={(o) => !quittingChrome && setChromeDialogOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Cần bật DevTools Protocol
            </AlertDialogTitle>
            <AlertDialogDescription>
              {chromeCount > 0 ? (
                <>Phát hiện <strong>{chromeCount}</strong> tiến trình Chrome đang mở nhưng chưa bật debug port 9222.<br /><br /></>
              ) : null}
              Để AI mở <strong>tab mới trong Chrome thật</strong> của bạn (không phải đóng Chrome mỗi lần), cần khởi động Chrome một lần với cờ <code>--remote-debugging-port=9222</code>.
              <br /><br />
              Nhấn <strong>Mở lại Chrome</strong> để app tự đóng êm Chrome (lưu phiên), khởi động lại với debug port + tự khôi phục mọi tab cũ. Chỉ cần làm 1 lần.
              <br /><br />
              Nếu Chrome treo, dùng <strong>Force quit</strong> (sẽ mất tab chưa lưu).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={quittingChrome}>Huỷ</AlertDialogCancel>
            <Button
              variant="outline"
              disabled={quittingChrome}
              onClick={() => handleQuitChrome(true)}
            >
              {quittingChrome ? <Loader2 className="h-4 w-4 animate-spin" /> : "Force quit"}
            </Button>
            <AlertDialogAction
              disabled={quittingChrome}
              onClick={(e) => { e.preventDefault(); handleRelaunchChrome(); }}
            >
              {quittingChrome ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Mở lại Chrome (debug port)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
