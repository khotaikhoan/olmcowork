import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OculoLogo } from "@/components/OculoLogo";
import {
  Plus,
  Search,
  Clock,
  Activity as ActivityIcon,
  Scale,
  Settings,
  LogOut,
  PanelLeftOpen,
  Brain,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCommandPalette } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  onNew: () => void;
  onOpenSettings: () => void;
  onExpand: () => void;
}

/**
 * Compact 56-px sidebar rail (Cursor / VS Code style). Only icons with tooltips;
 * the chat list is hidden — user must expand to see/select past conversations.
 */
export function MiniRail({ onNew, onOpenSettings, onExpand }: Props) {
  const nav = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const cp = useCommandPalette();
  const [failedCount, setFailedCount] = useState(0);

  // Poll recent failed tool calls (last 24h) for activity badge
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const load = async () => {
      const { count } = await supabase
        .from("activity_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("status", ["error", "denied"])
        .gte("created_at", since);
      if (!cancelled) setFailedCount(count ?? 0);
    };
    load();

    // Refresh when user navigates back from /activity (presumably reviewed)
    const ch = supabase
      .channel("mini-rail-activity")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user, location.pathname]);

  const Item = ({
    icon,
    label,
    onClick,
    accent,
    badge,
  }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    accent?: boolean;
    badge?: number;
  }) => (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <Button
          variant={accent ? "default" : "ghost"}
          size="icon"
          className="h-9 w-9 relative"
          onClick={onClick}
        >
          {icon}
          {badge !== undefined && badge > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-none flex items-center justify-center shadow-[var(--shadow-soft)] ring-2 ring-sidebar"
              aria-label={`${badge} hoạt động cần xem`}
            >
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider>
      <aside className="w-14 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-screen items-center py-3 gap-1">
        {/* Logo */}
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <button
              onClick={onExpand}
              className="h-9 w-9 rounded-lg bg-[image:var(--gradient-primary)] flex items-center justify-center shadow-[var(--shadow-soft)] hover:scale-105 transition-transform"
            >
              <OculoLogo size={20} withGradient={false} className="text-primary-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Mở rộng sidebar</TooltipContent>
        </Tooltip>

        <div className="h-px w-8 bg-sidebar-border my-2" />

        <Item
          icon={<Plus className="h-4 w-4" />}
          label="Cuộc trò chuyện mới"
          onClick={onNew}
          accent
        />
        <Item
          icon={<Search className="h-4 w-4" />}
          label="Tìm kiếm hoặc lệnh… (⌘K)"
          onClick={() => cp.open()}
        />
        <Item
          icon={<PanelLeftOpen className="h-4 w-4" />}
          label="Mở rộng sidebar (⌘/Ctrl+B)"
          onClick={onExpand}
        />

        <div className="flex-1" />

        <Item
          icon={<Clock className="h-4 w-4" />}
          label="Scheduled agents"
          onClick={() => nav("/schedules")}
        />
        <Item
          icon={<ActivityIcon className="h-4 w-4" />}
          label={
            failedCount > 0
              ? `Nhật ký hoạt động (${failedCount} lỗi/từ chối trong 24h)`
              : "Nhật ký hoạt động"
          }
          onClick={() => nav("/activity")}
          badge={failedCount}
        />
        <Item
          icon={<Scale className="h-4 w-4" />}
          label="So sánh 2 model"
          onClick={() => nav("/compare")}
        />
        <Item
          icon={<Brain className="h-4 w-4" />}
          label="Bộ nhớ dài hạn"
          onClick={() => nav("/memories")}
        />
        <Item
          icon={<Settings className="h-4 w-4" />}
          label="Cài đặt (⌘,)"
          onClick={onOpenSettings}
        />

        <div className="h-px w-8 bg-sidebar-border my-1" />

        <ThemeToggle />
        <Item
          icon={<LogOut className="h-4 w-4" />}
          label="Đăng xuất"
          onClick={signOut}
        />
      </aside>
    </TooltipProvider>
  );
}
