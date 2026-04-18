import { useEffect, useState } from "react";
import { X } from "lucide-react";

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
    <div className="max-w-3xl mx-auto mt-2 flex items-center justify-center gap-1.5 flex-wrap animate-fade-in">
      {SHORTCUTS.map((s, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
        >
          {s.keys.map((k, ki) => (
            <kbd
              key={ki}
              className="font-mono px-1.5 py-0.5 rounded bg-muted/60 border border-border text-[10px] leading-none"
            >
              {k}
            </kbd>
          ))}
          <span>{s.label}</span>
          {i < SHORTCUTS.length - 1 && <span className="opacity-30 ml-1">·</span>}
        </span>
      ))}
      <button
        onClick={dismiss}
        title="Ẩn vĩnh viễn"
        className="ml-1 p-0.5 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground transition"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
