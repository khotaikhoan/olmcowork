import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import {
  MessageSquare,
  Plus,
  Settings,
  Clock,
  Sun,
  Moon,
  Monitor,
  Keyboard,
  LogOut,
  HelpCircle,
} from "lucide-react";

interface CommandPaletteContextValue {
  open: () => void;
  openShortcuts: () => void;
  setHandlers: (h: Partial<Handlers>) => void;
}

interface Handlers {
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onOpenSettings: () => void;
  onApplyPreset?: (presetId: string) => void;
}

const Ctx = createContext<CommandPaletteContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [handlers, setHandlersState] = useState<Handlers>({
    onNewChat: () => {},
    onSelectConversation: () => {},
    onOpenSettings: () => {},
  });
  const [convs, setConvs] = useState<{ id: string; title: string }[]>([]);
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const { setTheme } = useTheme();

  const setHandlers = useCallback((h: Partial<Handlers>) => {
    setHandlersState((p) => ({ ...p, ...h }));
  }, []);

  // Load conversations when opening
  useEffect(() => {
    if (!open || !user) return;
    supabase
      .from("conversations")
      .select("id,title")
      .order("updated_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setConvs(data ?? []));
  }, [open, user]);

  // Global shortcuts: ⌘K / Ctrl+K and ?
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target as HTMLElement;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    setTimeout(fn, 50);
  };

  return (
    <Ctx.Provider
      value={{
        open: () => setOpen(true),
        openShortcuts: () => setShortcutsOpen(true),
        setHandlers,
      }}
    >
      {children}

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Tìm cuộc trò chuyện, lệnh, cài đặt…" />
        <CommandList>
          <CommandEmpty>Không có kết quả.</CommandEmpty>

          <CommandGroup heading="Hành động">
            <CommandItem onSelect={() => run(() => handlers.onNewChat())}>
              <Plus className="h-4 w-4 mr-2" /> Cuộc trò chuyện mới
              <span className="ml-auto text-xs text-muted-foreground">⌘N</span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => nav("/schedules"))}>
              <Clock className="h-4 w-4 mr-2" /> Scheduled agents
            </CommandItem>
            <CommandItem onSelect={() => run(() => handlers.onOpenSettings())}>
              <Settings className="h-4 w-4 mr-2" /> Cài đặt
              <span className="ml-auto text-xs text-muted-foreground">⌘,</span>
            </CommandItem>
            <CommandItem onSelect={() => run(() => setShortcutsOpen(true))}>
              <Keyboard className="h-4 w-4 mr-2" /> Phím tắt
              <span className="ml-auto text-xs text-muted-foreground">?</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Giao diện">
            <CommandItem onSelect={() => run(() => setTheme("light"))}>
              <Sun className="h-4 w-4 mr-2" /> Sáng
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("dark"))}>
              <Moon className="h-4 w-4 mr-2" /> Tối
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme("system"))}>
              <Monitor className="h-4 w-4 mr-2" /> Theo hệ thống
            </CommandItem>
          </CommandGroup>

          {convs.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Cuộc trò chuyện gần đây">
                {convs.map((c) => (
                  <CommandItem
                    key={c.id}
                    onSelect={() => run(() => handlers.onSelectConversation(c.id))}
                  >
                    <MessageSquare className="h-4 w-4 mr-2 opacity-60" />
                    <span className="truncate">{c.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <CommandGroup heading="Tài khoản">
            <CommandItem onSelect={() => run(() => signOut())}>
              <LogOut className="h-4 w-4 mr-2" /> Đăng xuất
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </Ctx.Provider>
  );
}

export function useCommandPalette() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}

// ----- Shortcuts overlay -----
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "⌘ K", label: "Mở Command Palette" },
  { keys: "?", label: "Hiện phím tắt này" },
  { keys: "⌘ Enter", label: "Gửi tin nhắn" },
  { keys: "Shift + Enter", label: "Xuống dòng trong ô chat" },
  { keys: "Esc", label: "Đóng dialog / dừng streaming" },
];

function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md animate-scale-in">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" /> Phím tắt
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div
              key={s.keys}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span>{s.label}</span>
              <kbd className="font-mono text-xs px-2 py-0.5 rounded bg-muted border border-border">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
