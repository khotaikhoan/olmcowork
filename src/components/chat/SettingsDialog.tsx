import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { pingOllama } from "@/lib/ollama";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (settings: SettingsValue) => void;
}

export interface SettingsValue {
  ollama_url: string;
  default_model: string | null;
  require_confirm: boolean;
  auto_stop_minutes: number;
  auto_start: boolean;
}

export function SettingsDialog({ open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const [url, setUrl] = useState("http://localhost:11434");
  const [model, setModel] = useState("");
  const [requireConfirm, setRequireConfirm] = useState(true);
  const [autoStopMinutes, setAutoStopMinutes] = useState(0);
  const [autoStart, setAutoStart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"unknown" | "ok" | "fail">("unknown");

  useEffect(() => {
    if (!open || !user) return;
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUrl(data.ollama_url);
          setModel(data.default_model ?? "");
          setRequireConfirm(data.require_confirm);
          setAutoStopMinutes((data as any).auto_stop_minutes ?? 0);
          setAutoStart((data as any).auto_start ?? true);
        }
      });
  }, [open, user]);

  const test = async () => {
    setStatus("unknown");
    const ok = await pingOllama(url);
    setStatus(ok ? "ok" : "fail");
    toast[ok ? "success" : "error"](
      ok ? "Connected to Ollama" : "Cannot reach Ollama (check OLLAMA_ORIGINS=*)",
    );
  };

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const payload = {
      user_id: user.id,
      ollama_url: url,
      default_model: model || null,
      require_confirm: requireConfirm,
      auto_stop_minutes: autoStopMinutes,
      auto_start: autoStart,
    };
    const { error } = await supabase.from("user_settings").upsert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    onSaved({
      ollama_url: url,
      default_model: model || null,
      require_confirm: requireConfirm,
      auto_stop_minutes: autoStopMinutes,
      auto_start: autoStart,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your local Ollama connection. To allow browser access, start Ollama with{" "}
            <code className="px-1 bg-muted rounded">OLLAMA_ORIGINS=* ollama serve</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="url">Ollama URL</Label>
            <div className="flex gap-2">
              <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} />
              <Button variant="outline" onClick={test}>
                Test
              </Button>
            </div>
            {status === "ok" && <p className="text-xs text-[hsl(var(--success))]">Connected ✓</p>}
            {status === "fail" && <p className="text-xs text-destructive">Connection failed</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Default model (optional)</Label>
            <Input
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. llama3.1:8b"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Require confirmation for risky tool calls</Label>
              <p className="text-xs text-muted-foreground">
                Used in Phase 2 (computer use). Recommended: ON.
              </p>
            </div>
            <Switch checked={requireConfirm} onCheckedChange={setRequireConfirm} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auto-stop">Auto-stop Ollama after idle (minutes)</Label>
            <Input
              id="auto-stop"
              type="number"
              min={0}
              max={1440}
              value={autoStopMinutes}
              onChange={(e) => setAutoStopMinutes(Math.max(0, Number(e.target.value) || 0))}
            />
            <p className="text-xs text-muted-foreground">
              0 = disabled. Only works in the desktop app. Timer resets on each message.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-start Ollama on first message</Label>
              <p className="text-xs text-muted-foreground">
                If Ollama is stopped, automatically start it before sending. Desktop app only.
              </p>
            </div>
            <Switch checked={autoStart} onCheckedChange={setAutoStart} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
