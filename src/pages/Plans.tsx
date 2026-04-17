import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ListChecks, Trash2, Zap, Search, Copy } from "lucide-react";
import { toast } from "sonner";

interface PlanRow {
  id: string;
  conversation_id: string | null;
  prompt: string;
  steps: { id: string; text: string }[];
  step_count: number;
  was_early_start: boolean;
  model: string | null;
  provider: string | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m}p trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h trước`;
  const d = Math.floor(h / 24);
  return `${d} ngày trước`;
}

export default function Plans() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && !user) nav("/auth", { replace: true });
  }, [loading, user, nav]);

  const load = async () => {
    const { data, error } = await supabase
      .from("approved_plans")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error(`Không tải được lịch sử plan: ${error.message}`);
      return;
    }
    setPlans((data ?? []) as any);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("approved_plans").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPlans((p) => p.filter((x) => x.id !== id));
    toast.success("Đã xoá plan");
  };

  const copyPrompt = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Đã copy goal");
  };

  const filtered = plans.filter((p) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      p.prompt.toLowerCase().includes(needle) ||
      p.steps.some((s) => s.text.toLowerCase().includes(needle))
    );
  });

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => nav("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Lịch sử Plan</h1>
          </div>
          <Badge variant="secondary" className="ml-auto">
            {plans.length} plan
          </Badge>
        </div>

        <div className="relative mb-4">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm theo goal hoặc step…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="space-y-3 pr-2">
            {filtered.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                {plans.length === 0
                  ? "Chưa có plan nào — chạy task ở chế độ Control để bắt đầu lưu lịch sử."
                  : "Không tìm thấy plan khớp với tìm kiếm."}
              </Card>
            ) : (
              filtered.map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(p.created_at)}
                        </span>
                        <Badge variant="outline" className="text-[10px] h-5">
                          {p.step_count} bước
                        </Badge>
                        {p.was_early_start && (
                          <Badge className="text-[10px] h-5 bg-warning/15 text-warning border-warning/30">
                            <Zap className="h-2.5 w-2.5 mr-0.5" /> bắt đầu sớm
                          </Badge>
                        )}
                        {p.model && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {p.model}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium mb-2 break-words">
                        {p.prompt}
                      </div>
                      <ol className="space-y-1 ml-1">
                        {p.steps.map((s, i) => (
                          <li key={s.id ?? i} className="flex gap-2 text-xs text-foreground/80">
                            <span className="text-muted-foreground font-mono shrink-0">
                              {i + 1}.
                            </span>
                            <span className="break-words">{s.text}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Copy goal"
                        onClick={() => copyPrompt(p.prompt)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Xoá"
                        onClick={() => remove(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
