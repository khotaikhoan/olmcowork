import { useEffect, useRef, useState, KeyboardEvent } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquare,
  MoreHorizontal,
  Trash2,
  Pencil,
  Pin,
  PinOff,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "./ConversationList";

interface Props {
  conversation: Conversation;
  selected: boolean;
  pinned: boolean;
  preview?: string;
  timeLabel?: string;
  onSelect: () => void;
  onPin: () => void;
  onRenameSubmit: (newTitle: string) => void;
  onRequestDelete: () => void;
}

export function ConversationItem({
  conversation,
  selected,
  pinned,
  preview,
  timeLabel,
  onSelect,
  onPin,
  onRenameSubmit,
  onRequestDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(conversation.title);
    setEditing(true);
  };

  const commit = () => {
    const t = draft.trim();
    if (t && t !== conversation.title) onRenameSubmit(t);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(conversation.title);
    setEditing(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  return (
    <div
      onClick={() => !editing && onSelect()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      className={cn(
        "group flex items-start gap-2 px-2 py-2 rounded-lg cursor-pointer text-sm transition-all duration-150",
        selected
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60",
      )}
    >
      <div className="mt-0.5 shrink-0">
        {pinned ? (
          <Pin className="h-3.5 w-3.5 text-primary fill-primary/30" />
        ) : conversation.mode === "control" ? (
          <Monitor className="h-3.5 w-3.5 text-warning" />
        ) : (
          <MessageSquare className="h-3.5 w-3.5 opacity-60" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-background border border-input rounded px-1.5 py-0.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="flex-1 truncate font-medium leading-tight" title="Bấm đôi để đổi tên">
                {conversation.title}
              </span>
              {timeLabel && (
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                  {timeLabel}
                </span>
              )}
            </div>
            {preview && (
              <div className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                {preview}
              </div>
            )}
          </>
        )}
      </div>
      {!editing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-sidebar-border transition mt-0.5"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={onPin}>
              {pinned ? (
                <>
                  <PinOff className="h-3.5 w-3.5 mr-2" /> Bỏ ghim
                </>
              ) : (
                <>
                  <Pin className="h-3.5 w-3.5 mr-2" /> Ghim
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Đổi tên
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onRequestDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Xoá
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
