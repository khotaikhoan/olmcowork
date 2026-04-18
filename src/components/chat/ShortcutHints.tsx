import { useEffect, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

const LS_KEY = "chat.shortcut_hints_dismissed";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Tìm kiếm" },
  { keys: ["Shift", "↵"], label: "Xuống dòng" },
  { keys: ["↵"], label: "Gửi" },
  { keys: ["Esc"], label: "Dừng" },
];

export function ShortcutHints() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(localStorage.getItem(LS_KEY) !== "1");
    } catch {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(LS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!show) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-w-3xl mx-auto mt-2 flex items-center justify-center animate-fade-in">
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <HelpCircle className="h-3.5 w-3.5 mr-1 opacity-70" />
                  Phím tắt
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              Bấm để xem phím tắt
            </TooltipContent>
          </Tooltip>
          <PopoverContent align="center" sideOffset={6} className="w-72 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-foreground">Phím tắt</span>
              <button
                onClick={dismiss}
                title="Ẩn vĩnh viễn"
                className="p-1 rounded hover:bg-muted text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid gap-2">
              {SHORTCUTS.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    {s.keys.map((k, ki) => (
                      <kbd
                        key={ki}
                        className="font-mono px-1.5 py-0.5 rounded bg-muted/60 border border-border text-[10px] leading-none"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}
