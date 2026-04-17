import { useState } from "react";
import {
  ListChecks,
  Plus,
  Trash2,
  Play,
  X,
  GripVertical,
  Pencil,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PlanStep } from "@/lib/planGen";

interface Props {
  steps: PlanStep[];
  loading?: boolean;
  onApprove: (steps: PlanStep[]) => void;
  onSkip: () => void;
  onCancel: () => void;
}

/**
 * Plan card shown in Control mode before the agent starts executing tools.
 * User can edit step text, delete steps, add new ones, or skip planning entirely.
 */
export function PlanCard({ steps: initial, loading, onApprove, onSkip, onCancel }: Props) {
  const [steps, setSteps] = useState<PlanStep[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);

  const update = (id: string, text: string) =>
    setSteps((s) => s.map((st) => (st.id === id ? { ...st, text } : st)));
  const remove = (id: string) => setSteps((s) => s.filter((st) => st.id !== id));
  const add = () =>
    setSteps((s) => [
      ...s,
      { id: `s${s.length}-${Date.now().toString(36)}`, text: "" },
    ]);

  const valid = steps.filter((s) => s.text.trim().length > 0);

  return (
    <div className="my-3 rounded-2xl border-2 border-primary/30 bg-card overflow-hidden shadow-[var(--shadow-soft)]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-primary/5">
        <ListChecks className="h-4 w-4 text-primary" />
        <div className="font-medium text-sm">Plan trước khi chạy</div>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground"
          title="Huỷ"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading && steps.length === 0 ? (
        <div className="px-4 py-6 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Đang phân tích goal và tạo các bước…
        </div>
      ) : (
        <ul className="px-3 py-2 space-y-1">
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                "group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40",
                editingId === s.id && "bg-muted/40",
              )}
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-mono flex items-center justify-center shrink-0">
                {i + 1}
              </div>
              {editingId === s.id ? (
                <Input
                  autoFocus
                  value={s.text}
                  onChange={(e) => update(s.id, e.target.value)}
                  onBlur={() => setEditingId(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") setEditingId(null);
                  }}
                  className="h-7 text-sm flex-1"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingId(s.id)}
                  className="flex-1 text-left text-sm text-foreground/90 truncate"
                  title="Click để sửa"
                >
                  {s.text || <span className="text-muted-foreground italic">trống — click để sửa</span>}
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditingId(s.id)}
                className="opacity-0 group-hover:opacity-100 h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground transition"
                title="Sửa"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => remove(s.id)}
                className="opacity-0 group-hover:opacity-100 h-6 w-6 rounded-md hover:bg-destructive/10 hover:text-destructive flex items-center justify-center text-muted-foreground transition"
                title="Xoá"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={add}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm bước
            </button>
          </li>
        </ul>
      )}

      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border bg-muted/20">
        <div className="text-[11px] text-muted-foreground">
          {valid.length} bước · AI sẽ làm theo thứ tự
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Bỏ qua plan
          </Button>
          <Button
            size="sm"
            onClick={() => onApprove(valid)}
            disabled={loading || valid.length === 0}
          >
            <Play className="h-3 w-3 mr-1" /> Bắt đầu
          </Button>
        </div>
      </div>
    </div>
  );
}
