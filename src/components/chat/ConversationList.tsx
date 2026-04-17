import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MessageSquare,
  MoreHorizontal,
  Trash2,
  Pencil,
  Search,
  Settings,
  LogOut,
  Bot,
  Clock,
  Pin,
  PinOff,
  Activity as ActivityIcon,
  Scale,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useCommandPalette } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getPins, togglePin } from "@/lib/pins";
import type { ConversationMode } from "@/lib/tools";

export interface Conversation {
  id: string;
  title: string;
  model: string | null;
  system_prompt: string | null;
  updated_at: string;
  mode: ConversationMode;
}

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshKey: number;
  onOpenSettings: () => void;
}

export function ConversationList({
  selectedId,
  onSelect,
  onNew,
  refreshKey,
  onOpenSettings,
}: Props) {
  const { signOut, user } = useAuth();
  const nav = useNavigate();
  const cp = useCommandPalette();
  const [items, setItems] = useState<Conversation[]>([]);
  const [q, setQ] = useState("");
  const [pinSet, setPinSet] = useState<Set<string>>(new Set(getPins()));

  const load = async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("id,title,model,system_prompt,updated_at,mode")
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    else setItems((data ?? []) as unknown as Conversation[]);
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("conversations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (selectedId === id) onNew();
    load();
  };

  const rename = async (id: string, current: string) => {
    const t = window.prompt("Đổi tên cuộc trò chuyện", current);
    if (!t) return;
    const { error } = await supabase
      .from("conversations")
      .update({ title: t })
      .eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const handlePin = (id: string) => {
    togglePin(id);
    setPinSet(new Set(getPins()));
  };

  const filtered = items.filter((i) => i.title.toLowerCase().includes(q.toLowerCase()));
  const pinned = filtered.filter((i) => pinSet.has(i.id));
  const others = filtered.filter((i) => !pinSet.has(i.id));

  const renderItem = (c: Conversation) => (
    <div
      key={c.id}
      onClick={() => onSelect(c.id)}
      className={cn(
        "group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer text-sm transition-all duration-150",
        selectedId === c.id
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60",
      )}
    >
      {pinSet.has(c.id) ? (
        <Pin className="h-3.5 w-3.5 shrink-0 text-primary fill-primary/30" />
      ) : c.mode === "control" ? (
        <Monitor className="h-3.5 w-3.5 shrink-0 text-warning" />
      ) : (
        <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
      )}
      <span className="flex-1 truncate">{c.title}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-sidebar-border transition"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => handlePin(c.id)}>
            {pinSet.has(c.id) ? (
              <>
                <PinOff className="h-3.5 w-3.5 mr-2" /> Bỏ ghim
              </>
            ) : (
              <>
                <Pin className="h-3.5 w-3.5 mr-2" /> Ghim
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => rename(c.id, c.title)}>
            <Pencil className="h-3.5 w-3.5 mr-2" /> Đổi tên
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => remove(c.id)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" /> Xoá
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <aside className="w-72 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-screen animate-fade-in">
      <div className="p-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-lg bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-soft)]">
            <Bot className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="font-serif font-semibold text-sidebar-foreground tracking-tight">
            Ollama Cowork
          </div>
          <div className="ml-auto">
            <ThemeToggle />
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

      <div className="p-3 pt-2">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Lọc nhanh…"
            className="pl-8 h-8 text-sm bg-sidebar-accent/40 border-sidebar-border"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="space-y-0.5 pb-2">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8 px-3">
              Chưa có cuộc trò chuyện nào
            </p>
          )}
          {pinned.length > 0 && (
            <>
              <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Đã ghim
              </div>
              {pinned.map(renderItem)}
              {others.length > 0 && <div className="h-px bg-sidebar-border my-2 mx-2" />}
            </>
          )}
          {others.map(renderItem)}
        </div>
      </ScrollArea>

      <div className="border-t border-sidebar-border p-2 space-y-1">
        <div className="px-2 py-1 text-xs text-muted-foreground truncate">{user?.email}</div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => nav("/schedules")}
        >
          <Clock className="h-4 w-4 mr-2" /> Scheduled agents
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => nav("/activity")}
        >
          <ActivityIcon className="h-4 w-4 mr-2" /> Nhật ký hoạt động
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => nav("/compare")}
        >
          <Scale className="h-4 w-4 mr-2" /> So sánh 2 model
        </Button>
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
    </aside>
  );
}
