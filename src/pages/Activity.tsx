import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface LogEntry {
  id: string;
  conversation_id: string | null;
  message_id: string | null;
  tool_name: string;
  args: any;
  risk: string;
  status: string;
  output: string | null;
  created_at: string;
}

export default function Activity() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low" | "denied" | "error">("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && !user) nav("/auth", { replace: true });
  }, [loading, user, nav]);

  const load = async () => {
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setLogs((data ?? []) as LogEntry[]);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel("activity-log")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  const clearAll = async () => {
    if (!confirm("Xoá toàn bộ activity log? Không thể hoàn tác.")) return;
    const { error } = await supabase.from("activity_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) toast.error(error.message);
    else {
      toast.success("Đã xoá");
      load();
    }
  };

  const filtered = logs.filter((l) => {
    if (filter === "denied" && l.status !== "denied") return false;
    if (filter === "error" && l.status !== "error") return false;
    if ((filter === "high" || filter === "medium" || filter === "low") && l.risk !== filter) return false;
    if (q && !`${l.tool_name} ${JSON.stringify(l.args ?? {})} ${l.output ?? ""}`.toLowerCase().includes(q.toLowerCase()))
      return false;
    return true;
  });

  function RiskIcon({ risk }: { risk: string }) {
    if (risk === "high") return <ShieldAlert className="h-3 w-3 text-destructive" />;
    if (risk === "medium") return <ShieldQuestion className="h-3 w-3 text-[hsl(var(--warning))]" />;
    return <ShieldCheck className="h-3 w-3 text-[hsl(var(--success))]" />;
  }

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Activity log</h1>
        <Badge variant="outline" className="text-xs">{logs.length} mục</Badge>
        <div className="ml-4 flex items-center gap-1 rounded-lg border border-border p-0.5 bg-muted/30">
          {(["all", "high", "medium", "low", "denied", "error"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors capitalize " +
                (filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")
              }
            >
              {f === "all" ? "Tất cả" : f}
            </button>
          ))}
        </div>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm tool/args/output…"
          className="ml-4 h-8 max-w-xs"
        />
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={clearAll} disabled={logs.length === 0}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Xoá tất cả
          </Button>
        </div>
      </header>

      <ScrollArea className="h-[calc(100vh-64px)]">
        <div className="max-w-4xl mx-auto p-6 space-y-2">
          {filtered.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground text-sm">
              Chưa có hoạt động nào khớp bộ lọc. Mọi tool call sẽ được ghi lại ở đây.
            </Card>
          )}
          {filtered.map((l) => (
            <Card key={l.id} className="p-3 hover:shadow-[var(--shadow-elevated)] transition-shadow">
              <div className="flex items-center gap-2 flex-wrap">
                <RiskIcon risk={l.risk} />
                <span className="font-mono text-sm font-semibold">{l.tool_name}</span>
                <Badge variant="outline" className="text-[10px] gap-1">
                  {l.status === "done" ? (
                    <CheckCircle2 className="h-2.5 w-2.5 text-[hsl(var(--success))]" />
                  ) : l.status === "denied" ? (
                    <XCircle className="h-2.5 w-2.5 text-muted-foreground" />
                  ) : (
                    <XCircle className="h-2.5 w-2.5 text-destructive" />
                  )}
                  {l.status}
                </Badge>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {l.risk}
                </Badge>
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {new Date(l.created_at).toLocaleString()}
                </span>
              </div>
              {l.args && (
                <pre className="mt-2 text-[11px] bg-muted/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                  {JSON.stringify(l.args, null, 2).slice(0, 400)}
                </pre>
              )}
              {l.output && (
                <details className="mt-1">
                  <summary className="text-[11px] text-muted-foreground cursor-pointer">Output</summary>
                  <pre className="mt-1 text-[11px] bg-muted/30 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                    {l.output}
                  </pre>
                </details>
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
