/**
 * Memories management page — view, edit importance, and delete cross-conversation
 * facts that get injected into every new conversation's system prompt.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Brain,
  Trash2,
  Plus,
  Save,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  addMemory,
  forgetMemory,
  listAllMemories,
  updateMemory,
  type UserMemory,
} from "@/lib/memory";

export default function Memories() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<UserMemory[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [newFact, setNewFact] = useState("");
  const [newImportance, setNewImportance] = useState(5);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav("/auth", { replace: true });
  }, [loading, user, nav]);

  const refresh = async () => {
    if (!user) return;
    setLoadingList(true);
    try {
      const list = await listAllMemories(user.id);
      setItems(list);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (user) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleAdd = async () => {
    if (!user || !newFact.trim()) return;
    setBusy(true);
    try {
      const m = await addMemory(user.id, newFact, { importance: newImportance });
      if (m) {
        setItems((p) => [m, ...p]);
        setNewFact("");
        setNewImportance(5);
        toast.success("Đã thêm ghi nhớ");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (id: string, fact: string, importance: number) => {
    try {
      await updateMemory(id, { fact, importance });
      toast.success("Đã lưu");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xoá ghi nhớ này?")) return;
    try {
      await forgetMemory(id);
      setItems((p) => p.filter((m) => m.id !== id));
      toast.success("Đã xoá");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 border-b border-border bg-background/80 backdrop-blur flex items-center gap-3 px-4 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Brain className="h-5 w-5 text-primary" />
        <h1 className="font-semibold">Bộ nhớ dài hạn</h1>
        <span className="text-xs text-muted-foreground">
          Top 10 quan trọng nhất sẽ được chèn vào system prompt mỗi cuộc trò chuyện mới
        </span>
      </header>

      <ScrollArea className="flex-1">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          <section className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Label className="text-sm font-medium">Thêm ghi nhớ mới</Label>
            <Textarea
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              rows={2}
              placeholder='Vd: "Người dùng đang làm dự án Lovable, ưu tiên TypeScript, dùng Tailwind."'
            />
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground">Mức quan trọng (1-10)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={newImportance}
                onChange={(e) => setNewImportance(Number(e.target.value) || 5)}
                className="w-20 h-8"
              />
              <div className="flex-1" />
              <Button onClick={handleAdd} disabled={busy || !newFact.trim()} size="sm">
                <Plus className="h-3.5 w-3.5 mr-1" /> Thêm
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">
                Tất cả ghi nhớ ({items.length})
              </h2>
              {loadingList && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            {items.length === 0 && !loadingList && (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Chưa có ghi nhớ nào. Thêm fact đầu tiên ở trên.
              </div>
            )}
            {items.map((m) => (
              <MemoryRow key={m.id} memory={m} onSave={handleSave} onDelete={handleDelete} />
            ))}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

function MemoryRow({
  memory,
  onSave,
  onDelete,
}: {
  memory: UserMemory;
  onSave: (id: string, fact: string, importance: number) => void;
  onDelete: (id: string) => void;
}) {
  const [fact, setFact] = useState(memory.fact);
  const [importance, setImportance] = useState(memory.importance);
  const dirty = fact !== memory.fact || importance !== memory.importance;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <Textarea
        value={fact}
        onChange={(e) => setFact(e.target.value)}
        rows={2}
        className="resize-none"
      />
      <div className="flex items-center gap-2">
        <Label className="text-[11px] text-muted-foreground">Quan trọng:</Label>
        <Input
          type="number"
          min={1}
          max={10}
          value={importance}
          onChange={(e) => setImportance(Number(e.target.value) || 5)}
          className="w-16 h-7 text-xs"
        />
        <span className="text-[11px] text-muted-foreground">
          Cập nhật {new Date(memory.updated_at).toLocaleDateString()}
        </span>
        <div className="flex-1" />
        {dirty && (
          <Button
            size="sm"
            variant="outline"
            className="h-7"
            onClick={() => onSave(memory.id, fact, importance)}
          >
            <Save className="h-3 w-3 mr-1" /> Lưu
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => onDelete(memory.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
