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
  Settings,
  LogOut,
  PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCommandPalette } from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeToggle";

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
  const { signOut } = useAuth();
  const cp = useCommandPalette();

  const Item = ({
    icon,
    label,
    onClick,
    accent,
  }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    accent?: boolean;
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
