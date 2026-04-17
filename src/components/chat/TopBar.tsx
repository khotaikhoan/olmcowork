import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { OllamaModel, RunningModel, formatBytes } from "@/lib/ollama";
import { Menu } from "lucide-react";
import {
  Wifi,
  WifiOff,
  Sparkles,
  OctagonX,
  Power,
  Loader2,
  Cpu,
  MemoryStick,
  Search,
  Download,
  FileJson,
  FileText,
} from "lucide-react";
import { UpdateBadge } from "./UpdateBadge";
import { TokenMeter } from "./TokenMeter";
import { CostMeter } from "./CostMeter";

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
  running: RunningModel[];
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  costModel: string;
  contextWindow?: number;
  contextWindowSource?: "real" | "fallback";
  lastReplyTokens?: number;
  tokensPerSecond?: number;
  onOpenSearch: () => void;
  onExport: (format: "markdown" | "json") => void;
  canExport: boolean;
  onToggleSidebar?: () => void;
}


const PRESETS: Record<string, string> = {
  "Mặc định": "",
  "Lập trình viên": "Bạn là một kỹ sư phần mềm chuyên nghiệp. Viết code sạch, đúng chuẩn và giải thích ngắn gọn bằng tiếng Việt.",
  "Người viết": "Bạn là trợ lý viết lách tinh tế. Cải thiện sự rõ ràng, giọng văn và mạch lạc. Phản hồi bằng tiếng Việt.",
  "Điều khiển máy": "Bạn là tác nhân điều khiển máy tính cẩn trọng. Lập kế hoạch ngắn, hỏi trước hành động rủi ro, giải thích từng bước bằng tiếng Việt.",
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
  running,
  totalTokens,
  lastReplyTokens,
  tokensPerSecond,
  inputTokens,
  outputTokens,
  totalCostUsd,
  costModel,
  contextWindow,
  contextWindowSource,
  onOpenSearch,
  onExport,
  canExport,
  onToggleSidebar,
}: Props) {
  return (
    <header className="h-14 border-b border-border bg-background/80 backdrop-blur flex items-center gap-2 sm:gap-3 px-2 sm:px-4 shrink-0 overflow-x-auto">
      {onToggleSidebar && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 md:hidden"
          onClick={onToggleSidebar}
          title="Mở sidebar"
        >
          <Menu className="h-4 w-4" />
        </Button>
      )}
      <Input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        className="h-8 w-32 sm:max-w-xs sm:w-auto border-0 bg-transparent font-medium text-base focus-visible:ring-1 shrink"
      />
      <div className="flex-1" />

      <Select value={model} onValueChange={onModelChange}>
        <SelectTrigger className="h-8 w-[200px] text-sm">
          <SelectValue placeholder="Chọn model" />
        </SelectTrigger>
        <SelectContent>
          {models.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Không có model nào</div>
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
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Hệ thống
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96">
          <div className="space-y-3">
            <Label>Lời nhắc hệ thống</Label>
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
              placeholder="Định nghĩa hành vi của trợ lý…"
            />
          </div>
        </PopoverContent>
      </Popover>

      {bridgeOnline && running.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              title="Model đang nạp — bấm xem chi tiết"
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-mono"
            >
              <MemoryStick className="h-3 w-3" />
              {formatBytes(running.reduce((s, r) => s + r.size, 0))}
              {running.some((r) => r.size_vram > 0) && (
                <span className="flex items-center gap-0.5 text-[hsl(var(--success))]">
                  <Cpu className="h-3 w-3" />
                  GPU
                </span>
              )}
              <span className="opacity-70">· {running.length}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-3">
            <div className="text-xs font-medium mb-2">Model đang nạp (RAM/VRAM)</div>
            <div className="space-y-2">
              {running.map((r) => {
                const cpuBytes = Math.max(0, r.size - r.size_vram);
                const vramPct = r.size > 0 ? Math.round((r.size_vram / r.size) * 100) : 0;
                return (
                  <div key={r.name} className="rounded-md border border-border p-2">
                    <div className="font-mono text-xs font-semibold mb-1 truncate">{r.name}</div>
                    <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                      <span>Tổng {formatBytes(r.size)}</span>
                      <span>{vramPct}% trên GPU</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden flex">
                      <div className="bg-[hsl(var(--success))]" style={{ width: `${vramPct}%` }} />
                      <div className="bg-warning/60" style={{ width: `${100 - vramPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[11px] mt-1">
                      <span className="text-[hsl(var(--success))]">VRAM {formatBytes(r.size_vram)}</span>
                      <span className="text-muted-foreground">RAM {formatBytes(cpuBytes)}</span>
                    </div>
                    {r.expires_at && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Tự gỡ lúc {new Date(r.expires_at).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <div
        title={bridgeOnline ? "Đã kết nối Ollama" : "Ollama ngoại tuyến"}
        className={
          "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md " +
          (bridgeOnline
            ? "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]"
            : "bg-destructive/15 text-destructive")
        }
      >
        {bridgeOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        {bridgeOnline ? "Trực tuyến" : "Ngoại tuyến"}
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenSearch}
        title="Tìm trong chat (⌘/Ctrl+F)"
        className="h-8 w-8"
      >
        <Search className="h-3.5 w-3.5" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={!canExport}
            title="Xuất hội thoại"
            className="h-8 w-8"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onExport("markdown")}>
            <FileText className="h-3.5 w-3.5 mr-2" /> Markdown (.md)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport("json")}>
            <FileJson className="h-3.5 w-3.5 mr-2" /> JSON (.json)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CostMeter
        model={costModel}
        inputTokens={inputTokens}
        outputTokens={outputTokens}
        totalCostUsd={totalCostUsd}
      />

      <TokenMeter
        totalTokens={totalTokens}
        lastReplyTokens={lastReplyTokens}
        tokensPerSecond={tokensPerSecond}
        contextWindow={contextWindow}
        contextWindowSource={contextWindowSource}
      />

      <UpdateBadge />

      {canControlOllama && (
        <Button
          variant={bridgeOnline ? "outline" : "default"}
          size="sm"
          onClick={onToggleOllama}
          disabled={ollamaBusy}
          title={bridgeOnline ? "Dừng Ollama để giải phóng RAM" : "Khởi động Ollama"}
          className="h-8"
        >
          {ollamaBusy ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Power className="h-3.5 w-3.5 mr-1" />
          )}
          {ollamaBusy ? (bridgeOnline ? "Đang dừng…" : "Đang khởi động…") : bridgeOnline ? "Dừng Ollama" : "Khởi động Ollama"}
        </Button>
      )}

      <Button
        variant="destructive"
        size="sm"
        onClick={onKillSwitch}
        disabled={!killArmed}
        title="Dừng tác nhân ngay lập tức và thu hồi mọi quyền tự duyệt"
        className="h-8 font-semibold shadow-[var(--shadow-soft)] disabled:opacity-40"
      >
        <OctagonX className="h-4 w-4 mr-1" />
        Dừng khẩn
      </Button>
    </header>
  );
}
