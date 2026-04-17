import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Wrench, Eye, Command } from "lucide-react";

const STORAGE_KEY = "onboarded.v1";

const STEPS = [
  {
    icon: Sparkles,
    title: "Chào mừng đến Oculo",
    body: "Trợ lý AI quan sát & cộng tác, hỗ trợ cả model local (Ollama, miễn phí) lẫn cloud (OpenAI, Lovable AI). Tất cả lưu trên cloud, đồng bộ giữa các thiết bị.",
  },
  {
    icon: Wrench,
    title: "Bật công cụ điều khiển máy",
    body: "Toggle 'Công cụ điều khiển máy' phía trên chat để cho phép AI chạy bash, đọc/sửa file, chụp màn hình. Mọi hành động rủi ro đều cần bạn xác nhận trước.",
  },
  {
    icon: Eye,
    title: "Vision remote control",
    body: "Bật tool rồi yêu cầu AI 'annotate màn hình'. Bạn sẽ thấy ảnh có số đánh dấu — click vào số bất kỳ để gửi click thật xuống máy. Shift+click = right-click.",
  },
  {
    icon: Command,
    title: "Phím tắt",
    body: "⌘/Ctrl+K mở command palette · ⌘/Ctrl+B ẩn/hiện sidebar · ⌘/Ctrl+, mở Cài đặt · ⌘/Ctrl+F tìm trong chat. Gõ /schedule trong khung nhắn để tạo job định kỳ.",
  },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      // small delay so it doesn't fight with auth redirect
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setOpen(false);
  };

  const s = STEPS[step];
  const Icon = s.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) finish(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="h-12 w-12 rounded-2xl bg-[image:var(--gradient-primary)] text-primary-foreground flex items-center justify-center mb-2">
            <Icon className="h-6 w-6" />
          </div>
          <DialogTitle>{s.title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
        <div className="flex items-center justify-center gap-1.5 py-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={
                "h-1.5 rounded-full transition-all " +
                (i === step ? "w-6 bg-primary" : "w-1.5 bg-muted")
              }
            />
          ))}
        </div>
        <DialogFooter className="sm:justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>
            Bỏ qua
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                Quay lại
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => (isLast ? finish() : setStep(step + 1))}
            >
              {isLast ? "Bắt đầu" : "Tiếp theo"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
