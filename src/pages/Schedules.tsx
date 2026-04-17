import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Play,
  Plus,
  Trash2,
  Clock,
  CloudCog,
  Monitor,
  CheckCircle2,
  XCircle,
  Loader2,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { isElectron } from "@/lib/bridge";

interface Job {
  id: string;
  name: string;
  cron: string;
  prompt: string;
  model: string | null;
  job_type: "local" | "cloud";
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  tools_enabled: boolean;
}

interface Run {
  id: string;
  job_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  output: string | null;
  error: string | null;
}

const CRON_PRESETS = [
  { label: "Mỗi 5 phút", value: "*/5 * * * *" },
  { label: "Mỗi giờ", value: "0 * * * *" },
  { label: "Hàng ngày 8:00 UTC", value: "0 8 * * *" },
  { label: "Hàng ngày 0:00 UTC", value: "0 0 * * *" },
];

export default function Schedules() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [filter, setFilter] = useState<"all" | "cloud" | "local">("all");
  const [now, setNow] = useState(() => Date.now());

  // tick clock for countdowns
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Form
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 8 * * *");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("google/gemini-3-flash-preview");
  const [jobType, setJobType] = useState<"local" | "cloud">("cloud");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!loading && !user) nav("/auth", { replace: true });
  }, [loading, user, nav]);

  const load = async () => {
    const { data: j } = await supabase
      .from("scheduled_jobs")
      .select("*")
      .order("created_at", { ascending: false });
    setJobs((j ?? []) as Job[]);
    const { data: r } = await supabase
      .from("job_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);
    setRuns((r ?? []) as Run[]);
  };

  useEffect(() => {
    if (!user) return;
    load();

    // Realtime: push job_runs as they happen (insert/update)
    const channel = supabase
      .channel("schedules-runs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_runs", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scheduled_jobs", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const reset = () => {
    setEditing(null);
    setName("");
    setCron("0 8 * * *");
    setPrompt("");
    setModel("google/gemini-3-flash-preview");
    setJobType("cloud");
    setEnabled(true);
  };

  const openCreate = () => {
    reset();
    setOpen(true);
  };

  const openEdit = (j: Job) => {
    setEditing(j);
    setName(j.name);
    setCron(j.cron);
    setPrompt(j.prompt);
    setModel(j.model ?? "google/gemini-3-flash-preview");
    setJobType(j.job_type);
    setEnabled(j.enabled);
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    if (!name.trim() || !prompt.trim() || !cron.trim()) {
      toast.error("Tên, prompt và cron không được trống");
      return;
    }
    const payload = {
      user_id: user.id,
      name: name.trim(),
      cron: cron.trim(),
      prompt: prompt.trim(),
      model,
      job_type: jobType,
      enabled,
    };
    const { error } = editing
      ? await supabase
          .from("scheduled_jobs")
          .update(payload)
          .eq("id", editing.id)
      : await supabase.from("scheduled_jobs").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Đã cập nhật" : "Đã tạo job");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Xoá job này?")) return;
    const { error } = await supabase
      .from("scheduled_jobs")
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const toggle = async (j: Job) => {
    await supabase
      .from("scheduled_jobs")
      .update({ enabled: !j.enabled })
      .eq("id", j.id);
    load();
  };

  const runNow = async (j: Job) => {
    if (j.job_type === "cloud") {
      toast.info(`Đang chạy "${j.name}"…`);
      const { data, error } = await supabase.functions.invoke(
        "run-scheduled-job",
        { body: { job_id: j.id } },
      );
      if (error) toast.error(error.message);
      else toast.success(`Hoàn tất (ran=${data?.ran ?? 0})`);
      load();
    } else {
      // Local jobs run trong Electron main process
      if (!isElectron()) {
        toast.error("Job local chỉ chạy trong app desktop");
        return;
      }
      // @ts-ignore
      const r = await window.bridge?.runLocalJob?.({
        prompt: j.prompt,
        model: j.model,
      });
      if (r?.ok) {
        toast.success("Đã chạy local job");
      } else {
        toast.error(r?.output ?? "Local runner chưa sẵn sàng");
      }
      load();
    }
  };

  if (loading || !user) return null;

  const runsByJob = (jobId: string) =>
    runs.filter((r) => r.job_id === jobId).slice(0, 3);

  const filteredJobs = jobs.filter((j) => filter === "all" || j.job_type === filter);

  function formatCountdown(iso: string | null): string {
    if (!iso) return "—";
    const diff = new Date(iso).getTime() - now;
    if (diff <= 0) return "sắp chạy";
    const min = Math.floor(diff / 60_000);
    if (min < 60) return `trong ${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `trong ${h}h ${min % 60}m`;
    const d = Math.floor(h / 24);
    return `trong ${d}d ${h % 24}h`;
  }

  function StatusPill({ status }: { status: string }) {
    if (status === "ok" || status === "success")
      return (
        <Badge className="bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.2)] border-0 text-[10px] gap-1">
          <CheckCircle2 className="h-2.5 w-2.5" /> ok
        </Badge>
      );
    if (status === "error" || status === "failed")
      return (
        <Badge variant="destructive" className="text-[10px] gap-1">
          <XCircle className="h-2.5 w-2.5" /> error
        </Badge>
      );
    if (status === "running")
      return (
        <Badge className="bg-primary/15 text-primary hover:bg-primary/20 border-0 text-[10px] gap-1">
          <Loader2 className="h-2.5 w-2.5 animate-spin" /> running
        </Badge>
      );
    return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">Scheduled Agents</h1>
        <div className="ml-4 flex items-center gap-1 rounded-lg border border-border p-0.5 bg-muted/30">
          {(["all", "cloud", "local"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors " +
                (filter === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {f === "all" ? "Tất cả" : f}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} size="sm">
                <Plus className="h-4 w-4 mr-1" /> Tạo job mới
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editing ? "Sửa job" : "Tạo scheduled job"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto">
                <div>
                  <Label>Tên</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tóm tắt inbox mỗi sáng"
                  />
                </div>
                <div>
                  <Label>Cron (UTC)</Label>
                  <Input
                    value={cron}
                    onChange={(e) => setCron(e.target.value)}
                    placeholder="0 8 * * *"
                  />
                  <div className="flex gap-1 flex-wrap mt-1">
                    {CRON_PRESETS.map((p) => (
                      <Button
                        key={p.value}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setCron(p.value)}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Hỗ trợ: <code>*/N * * * *</code> hoặc <code>M H * * *</code>
                  </p>
                </div>
                <div>
                  <Label>Prompt</Label>
                  <Textarea
                    rows={5}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Việc cần làm khi đến giờ…"
                  />
                </div>
                <div>
                  <Label>Loại</Label>
                  <Select
                    value={jobType}
                    onValueChange={(v) => setJobType(v as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cloud">
                        Cloud (Lovable AI, chạy 24/7)
                      </SelectItem>
                      <SelectItem value="local">
                        Local (Ollama + tools, cần app mở)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Model</Label>
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={
                      jobType === "cloud"
                        ? "google/gemini-3-flash-preview"
                        : "qwen2.5:14b"
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Bật</Label>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Huỷ
                </Button>
                <Button onClick={save}>Lưu</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <ScrollArea className="h-[calc(100vh-64px)]">
        <div className="max-w-3xl mx-auto p-6 space-y-3">
          {filteredJobs.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">
              {jobs.length === 0
                ? <>Chưa có job nào. Tạo job đầu tiên hoặc dùng <code>/schedule</code> trong chat.</>
                : <>Không có job nào ở mục "{filter}".</>}
            </Card>
          )}
          {filteredJobs.map((j) => {
            const recent = runsByJob(j.id);
            return (
              <Card key={j.id} className="p-4 hover:shadow-[var(--shadow-elevated)] transition-shadow">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        className="font-semibold hover:underline truncate"
                        onClick={() => openEdit(j)}
                      >
                        {j.name}
                      </button>
                      <Badge
                        className={
                          j.enabled
                            ? "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.2)] border-0"
                            : "bg-muted text-muted-foreground border-0"
                        }
                      >
                        {j.enabled ? "ON" : "OFF"}
                      </Badge>
                      <Badge variant="outline" className="gap-1">
                        {j.job_type === "cloud" ? (
                          <CloudCog className="h-3 w-3" />
                        ) : (
                          <Monitor className="h-3 w-3" />
                        )}
                        {j.job_type}
                      </Badge>
                      <Badge variant="outline" className="gap-1 font-mono">
                        <Clock className="h-3 w-3" />
                        {j.cron}
                      </Badge>
                      {j.enabled && j.next_run_at && (
                        <Badge variant="outline" className="gap-1 text-primary border-primary/30">
                          <Timer className="h-3 w-3" />
                          {formatCountdown(j.next_run_at)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {j.prompt}
                    </p>
                    {recent.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {recent.map((r) => (
                          <details
                            key={r.id}
                            className="text-xs border border-border rounded px-2 py-1 hover:bg-muted/30 transition-colors"
                          >
                            <summary className="cursor-pointer flex items-center gap-2">
                              <StatusPill status={r.status} />
                              <span className="text-muted-foreground">
                                {new Date(r.started_at).toLocaleString()}
                              </span>
                              {r.finished_at && (
                                <span className="text-muted-foreground/70 text-[10px]">
                                  ({Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)}s)
                                </span>
                              )}
                            </summary>
                            <pre className="mt-1 whitespace-pre-wrap break-words text-[11px]">
                              {r.error ?? r.output ?? "(no output)"}
                            </pre>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runNow(j)}
                    >
                      <Play className="h-3.5 w-3.5 mr-1" /> Run
                    </Button>
                    <Switch
                      checked={j.enabled}
                      onCheckedChange={() => toggle(j)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(j.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
