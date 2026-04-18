import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { OchatLogo } from "@/components/OchatLogo";
import {
  Plus,
  Search,
  Settings,
  LogOut,
  PanelLeftClose,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

import { useCommandPalette } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getPins, togglePin } from "@/lib/pins";
import type { ConversationMode } from "@/lib/tools";
import { ConversationItem } from "./ConversationItem";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

export interface Conversation {
  id: string;
  title: string;
  model: string | null;
  system_prompt: string | null;
  updated_at: string;
  mode: ConversationMode;
  last_message_preview?: string | null;
  last_message_at?: string | null;
}

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshKey: number;
  onOpenSettings: () => void;
  onCollapse?: () => void;
}

const EXAMPLE_PROMPTS = [
  "Giải thích Transformer trong NLP cho người mới",
  "Viết script Python in 10 số Fibonacci đầu tiên",
  "Tóm tắt URL https://news.ycombinator.com",
];

type GroupKey = "today" | "week" | "month" | "older";
const GROUP_LABEL: Record<GroupKey, string> = {
  today: "Hôm nay",
  week: "7 ngày qua",
  month: "Tháng này",
  older: "Cũ hơn",
};
const GROUP_ORDER: GroupKey[] = ["today", "week", "month", "older"];

function bucketOf(iso: string): GroupKey {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffH = (now - t) / 36e5;
  if (diffH < 24) return "today";
  if (diffH < 24 * 7) return "week";
  if (diffH < 24 * 30) return "month";
  return "older";
}

export function ConversationList({
  selectedId,
  onSelect,
  onNew,
  refreshKey,
  onOpenSettings,
  onCollapse,
}: Props) {
  const { signOut, user } = useAuth();
  const cp = useCommandPalette();
  const [items, setItems] = useState<Conversation[]>([]);
  const [q, setQ] = useState("");
  const [pinSet, setPinSet] = useState<Set<string>>(new Set(getPins()));
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select(
        "id,title,model,system_prompt,updated_at,mode,last_message_preview,last_message_at",
      )
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((data ?? []) as unknown as Conversation[]);
  };

  // Derived map for fast lookup; preview is now stored on the row itself.
  const previews = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of items) {
      const p = c.last_message_preview;
      if (p && p.trim()) map[c.id] = p.slice(0, 140);
    }
    return map;
  }, [items]);

  useEffect(() => {
    load();
  }, [refreshKey]);

  // Realtime: refresh sidebar when conversations or messages change.
  // Debounced to coalesce streaming token bursts into a single reload.
  useEffect(() => {
    if (!user?.id) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        load();
      }, 400);
    };
    const channel = supabase
      .channel("sidebar-conv-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations", filter: `user_id=eq.${user.id}` },
        schedule,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` },
        schedule,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    const { error } = await supabase.from("conversations").delete().eq("id", target.id);
    if (error) return toast.error(error.message);
    if (selectedId === target.id) onNew();
    load();
  };

  const rename = async (id: string, newTitle: string) => {
    const { error } = await supabase
      .from("conversations")
      .update({ title: newTitle })
      .eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const handlePin = (id: string) => {
    togglePin(id);
    setPinSet(new Set(getPins()));
  };

  const fillPrompt = (prompt: string) => {
    onNew();
    // Defer so ChatInput is mounted, then fill via the existing event channel.
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("chat-input:fill", { detail: { text: prompt } }),
      );
    }, 50);
  };

  const { pinned, grouped, hasMatches } = useMemo(() => {
    const needle = q.toLowerCase();
    const filtered = needle
      ? items.filter(
          (i) =>
            i.title.toLowerCase().includes(needle) ||
            (previews[i.id] || "").toLowerCase().includes(needle),
        )
      : items;
    const pinnedList = filtered.filter((i) => pinSet.has(i.id));
    const others = filtered.filter((i) => !pinSet.has(i.id));
    const groups: Record<GroupKey, Conversation[]> = {
      today: [],
      week: [],
      month: [],
      older: [],
    };
    for (const c of others) groups[bucketOf(c.updated_at)].push(c);
    return {
      pinned: pinnedList,
      grouped: groups,
      hasMatches: filtered.length > 0,
    };
  }, [items, q, pinSet, previews]);

  const renderItem = (c: Conversation) => (
    <ConversationItem
      key={c.id}
      conversation={c}
      selected={selectedId === c.id}
      pinned={pinSet.has(c.id)}
      preview={previews[c.id]}
      timeLabel={formatDistanceToNow(new Date(c.updated_at), {
        addSuffix: false,
        locale: vi,
      })}
      onSelect={() => onSelect(c.id)}
      onPin={() => handlePin(c.id)}
      onRenameSubmit={(t) => rename(c.id, t)}
      onRequestDelete={() => setPendingDelete(c)}
    />
  );

  const isEmpty = items.length === 0;
  const isFilteredEmpty = !isEmpty && !hasMatches;

  return (
    <aside className="w-72 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-screen">
      <div className="p-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-lg bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-soft)]">
            <OchatLogo size={20} withGradient={false} className="text-primary-foreground" />
          </div>
          <div className="font-semibold text-sidebar-foreground tracking-tight">
            Ochat
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            {onCollapse && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onCollapse}
                title="Thu nhỏ sidebar (⌘/Ctrl+B)"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <Button onClick={onNew} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-1" /> Cuộc trò chuyện mới
        </Button>
      </div>

      <div className="px-3 pt-3">
        <button
          onClick={() => cp.open()}
          className="w-full flex items-center gap-2 h-8 px-2.5 text-xs rounded-md border border-sidebar-border bg-sidebar-accent/40 hover:bg-sidebar-accent text-muted-foreground transition-colors"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Tìm kiếm hoặc lệnh…</span>
          <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-background/60 border border-sidebar-border">
            ⌘K
          </kbd>
        </button>
      </div>

      {!isEmpty && (
        <div className="p-3 pt-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Lọc theo tiêu đề hoặc nội dung…"
              className="pl-8 h-8 text-sm bg-sidebar-accent/40 border-sidebar-border"
            />
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-0.5 pb-2">
          {isEmpty && (
            <div className="px-3 py-6 text-center animate-fade-in">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-soft)] mb-3">
                <Sparkles className="h-6 w-6 text-primary-foreground" />
              </div>
              <div className="text-sm font-medium text-sidebar-foreground mb-1">
                Bắt đầu cuộc trò chuyện đầu tiên
              </div>
              <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                Gõ một câu hỏi, hoặc thử một gợi ý bên dưới.
              </p>
              <div className="space-y-1.5">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => fillPrompt(p)}
                    className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-md border border-sidebar-border bg-sidebar-accent/40 hover:bg-sidebar-accent hover:border-primary/40 text-sidebar-foreground transition-colors line-clamp-2"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {isFilteredEmpty && (
            <p className="text-xs text-muted-foreground text-center py-8 px-3">
              Không tìm thấy cuộc trò chuyện nào khớp "{q}"
            </p>
          )}
          {pinned.length > 0 && (
            <>
              <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Đã ghim
              </div>
              {pinned.map(renderItem)}
              <div className="h-px bg-sidebar-border my-2 mx-2" />
            </>
          )}
          {GROUP_ORDER.map((key) => {
            const list = grouped[key];
            if (list.length === 0) return null;
            return (
              <div key={key}>
                <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {GROUP_LABEL[key]}
                </div>
                {list.map(renderItem)}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t border-sidebar-border p-2 space-y-1">
        <div className="px-2 py-1 text-xs text-muted-foreground truncate">{user?.email}</div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={onOpenSettings}
        >
          <Settings className="h-4 w-4 mr-2" /> Cài đặt
          <span className="ml-auto text-[10px] font-mono text-muted-foreground">⌘,</span>
        </Button>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
          <LogOut className="h-4 w-4 mr-2" /> Đăng xuất
        </Button>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá cuộc trò chuyện?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.title}" cùng toàn bộ tin nhắn sẽ bị xoá vĩnh viễn.
              Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
