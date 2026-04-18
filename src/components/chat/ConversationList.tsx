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
import { OculoLogo } from "@/components/OculoLogo";
import {
  Plus,
  Search,
  Settings,
  LogOut,
  PanelLeftClose,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

import { useCommandPalette } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getPins, togglePin } from "@/lib/pins";
import type { ConversationMode } from "@/lib/tools";
import { ConversationItem } from "./ConversationItem";

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
  onCollapse?: () => void;
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
      .select("id,title,model,system_prompt,updated_at,mode")
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    else setItems((data ?? []) as unknown as Conversation[]);
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

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

  const { pinned, others, hasMatches } = useMemo(() => {
    const needle = q.toLowerCase();
    const filtered = needle
      ? items.filter((i) => i.title.toLowerCase().includes(needle))
      : items;
    return {
      pinned: filtered.filter((i) => pinSet.has(i.id)),
      others: filtered.filter((i) => !pinSet.has(i.id)),
      hasMatches: filtered.length > 0,
    };
  }, [items, q, pinSet]);

  return (
    <aside className="w-72 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-screen">
      <div className="p-3 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-lg bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-soft)]">
            <OculoLogo size={20} withGradient={false} className="text-primary-foreground" />
          </div>
          <div className="font-semibold text-sidebar-foreground tracking-tight">
            Oculo
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
          {!hasMatches && (
            <p className="text-xs text-muted-foreground text-center py-8 px-3">
              Chưa có cuộc trò chuyện nào
            </p>
          )}
          {pinned.length > 0 && (
            <>
              <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Đã ghim
              </div>
              {pinned.map((c) => (
                <ConversationItem
                  key={c.id}
                  conversation={c}
                  selected={selectedId === c.id}
                  pinned
                  onSelect={() => onSelect(c.id)}
                  onPin={() => handlePin(c.id)}
                  onRenameSubmit={(t) => rename(c.id, t)}
                  onRequestDelete={() => setPendingDelete(c)}
                />
              ))}
              {others.length > 0 && <div className="h-px bg-sidebar-border my-2 mx-2" />}
            </>
          )}
          {others.map((c) => (
            <ConversationItem
              key={c.id}
              conversation={c}
              selected={selectedId === c.id}
              pinned={false}
              onSelect={() => onSelect(c.id)}
              onPin={() => handlePin(c.id)}
              onRenameSubmit={(t) => rename(c.id, t)}
              onRequestDelete={() => setPendingDelete(c)}
            />
          ))}
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
