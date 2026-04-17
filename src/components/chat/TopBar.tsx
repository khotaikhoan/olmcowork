import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { OllamaModel } from "@/lib/ollama";
import { Wifi, WifiOff, Sparkles, OctagonX, Power, Loader2 } from "lucide-react";

interface Props {
  title: string;
  models: OllamaModel[];
  model: string;
  onModelChange: (m: string) => void;
  systemPrompt: string;
  onSystemPromptChange: (s: string) => void;
  bridgeOnline: boolean;
  onTitleChange: (t: string) => void;
  onKillSwitch: () => void;
  killArmed: boolean;
  canControlOllama: boolean;
  ollamaBusy: boolean;
  onToggleOllama: () => void;
}

const PRESETS: Record<string, string> = {
  "Default": "",
  "Coder": "You are an expert software engineer. Write clean, idiomatic code with concise explanations.",
  "Writer": "You are a thoughtful writing assistant. Improve clarity, tone, and flow.",
  "Computer Agent": "You are a careful computer-use agent. Plan briefly, ask before risky actions, and explain each step.",
};

export function TopBar({
  title,
  models,
  model,
  onModelChange,
  systemPrompt,
  onSystemPromptChange,
  bridgeOnline,
  onTitleChange,
  onKillSwitch,
  killArmed,
  canControlOllama,
  ollamaBusy,
  onToggleOllama,
}: Props) {
  return (
    <header className="h-14 border-b border-border bg-background/80 backdrop-blur flex items-center gap-3 px-4 shrink-0">
      <Input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        className="h-8 max-w-xs border-0 bg-transparent font-medium text-base focus-visible:ring-1"
      />
      <div className="flex-1" />

      <Select value={model} onValueChange={onModelChange}>
        <SelectTrigger className="h-8 w-[200px] text-sm">
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {models.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No models found</div>
          )}
          {models.map((m) => (
            <SelectItem key={m.name} value={m.name}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8">
            <Sparkles className="h-3.5 w-3.5 mr-1" /> System
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96">
          <div className="space-y-3">
            <Label>System prompt</Label>
            <div className="flex flex-wrap gap-1">
              {Object.entries(PRESETS).map(([k, v]) => (
                <Button
                  key={k}
                  variant="secondary"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => onSystemPromptChange(v)}
                >
                  {k}
                </Button>
              ))}
            </div>
            <Textarea
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              rows={6}
              placeholder="Define the assistant's behavior…"
            />
          </div>
        </PopoverContent>
      </Popover>

      <div
        title={bridgeOnline ? "Ollama connected" : "Ollama offline"}
        className={
          "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md " +
          (bridgeOnline
            ? "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]"
            : "bg-destructive/15 text-destructive")
        }
      >
        {bridgeOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        {bridgeOnline ? "Online" : "Offline"}
      </div>

      {canControlOllama && (
        <Button
          variant={bridgeOnline ? "outline" : "default"}
          size="sm"
          onClick={onToggleOllama}
          disabled={ollamaBusy}
          title={bridgeOnline ? "Stop Ollama process to free RAM" : "Start Ollama process"}
          className="h-8"
        >
          {ollamaBusy ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Power className="h-3.5 w-3.5 mr-1" />
          )}
          {ollamaBusy ? (bridgeOnline ? "Stopping…" : "Starting…") : bridgeOnline ? "Stop Ollama" : "Start Ollama"}
        </Button>
      )}

      <Button
        variant="destructive"
        size="sm"
        onClick={onKillSwitch}
        disabled={!killArmed}
        title="Stop the agent immediately and revoke all auto-approvals"
        className="h-8 font-semibold shadow-[var(--shadow-soft)] disabled:opacity-40"
      >
        <OctagonX className="h-4 w-4 mr-1" />
        Kill Switch
      </Button>
    </header>
  );
}
