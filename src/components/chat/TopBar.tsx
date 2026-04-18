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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { OllamaModel, RunningModel, formatBytes } from "@/lib/ollama";
import {
  Menu,
  Wifi,
  WifiOff,
  Sparkles,
  OctagonX,
  Power,
  Loader2,
  Cpu,
  MemoryStick,
  Search,
  FileJson,
  FileText,
  ChevronDown,
  MoreHorizontal,
  Settings2,
} from "lucide-react";
import { UpdateBadge } from "./UpdateBadge";
import { ArmedBadge } from "./ArmedBadge";
import { TokenMeter } from "./TokenMeter";
import { CostMeter } from "./CostMeter";
import { ModeToggle } from "./ModeToggle";
import { AppLockSelect } from "./AppLockSelect";
import { AGENTS, getAgent } from "@/lib/agents";
import type { ConversationMode } from "@/lib/tools";

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
  mode: ConversationMode;
  onModeChange: (m: ConversationMode) => void;
  lockedApp: string | null;
  onLockedAppChange: (app: string | null) => void;
  agentId: string;
  onAgentChange: (id: string) => void;
  /** Optional extra slot rendered after Mode/Model — used for the compact ControlBar pill. */
  extraSlot?: React.ReactNode;
  provider: "ollama" | "openai";
  openaiModel: string;
  onOpenSettings?: () => void;
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
  mode,
  onModeChange,
  lockedApp,
  onLockedAppChange,
  agentId,
  onAgentChange,
  extraSlot,
  provider,
  openaiModel,
  onOpenSettings,
}: Props) {
  const activeAgent = getAgent(agentId);
  const ActiveAgentIcon = activeAgent.icon;
  const totalRunningBytes = running.reduce((s, r) => s + r.size, 0);

  const modelLabel =
    provider === "openai"
      ? (openaiModel?.split("/").pop() || openaiModel || "OpenAI")
      : model || "Model";

  return (
    <header className="h-14 border-b border-border bg-background/80 backdrop-blur flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 shrink-0 relative z-20 min-w-0 font-sans text-sm">
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

      {/* Essentials: Mode + Model */}
      <ModeToggle value={mode} onChange={onModeChange} />

      {mode === "control" && (
        <AppLockSelect value={lockedApp} onChange={onLockedAppChange} />
      )}

      {provider === "ollama" ? (
        <Select value={model} onValueChange={onModelChange}>
          <SelectTrigger
            title={`Model Ollama: ${model || "—"}`}
            className="h-8 w-[110px] sm:w-[160px] lg:w-[180px] text-sm border-0 bg-muted/50 hover:bg-muted focus:ring-1 shrink min-w-0"
          >
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
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-8 px-2 text-xs font-mono max-w-[180px] truncate"
          title={`OpenAI model: ${openaiModel}\nBấm để mở Cài đặt`}
          onClick={onOpenSettings}
        >
          {openaiModel}
        </Button>
      )}

      <ArmedBadge />

      {extraSlot}

      <div className="flex-1" />

      {/* Trạng thái một chỗ: kết nối + model + chi phí — bấm xem chi tiết */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            title="Trạng thái phiên — bấm xem chi tiết"
            className={
              "flex items-center gap-1.5 text-xs px-2 h-8 rounded-md transition-colors duration-200 hover:bg-muted max-w-[200px] sm:max-w-[240px] " +
              (bridgeOnline ? "text-foreground" : "text-muted-foreground")
            }
          >
            <span
              className={
                "w-1.5 h-1.5 shrink-0 rounded-full " +
                (bridgeOnline ? "bg-[hsl(var(--success))]" : "bg-destructive/70")
              }
            />
            <span className="truncate text-[11px] font-medium text-foreground/90 min-w-0">
              {provider === "openai" ? "OpenAI" : "Ollama"} · {modelLabel}
            </span>
            <span className="font-mono tabular-nums shrink-0 hidden sm:inline text-[11px] text-muted-foreground">
              ${totalCostUsd.toFixed(2)}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium">Trạng thái phiên</span>
              <span
                className={
                  "flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded " +
                  (bridgeOnline
                    ? "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]"
                    : "bg-muted text-muted-foreground")
                }
              >
                {bridgeOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {bridgeOnline ? "Trực tuyến" : "Ngoại tuyến"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2 truncate" title={provider === "ollama" ? model : openaiModel}>
              Đang dùng: <span className="font-mono text-foreground">{provider === "ollama" ? model || "—" : openaiModel}</span>
            </p>
            {!bridgeOnline && provider === "ollama" && (
              <div className="flex flex-wrap gap-2 mb-2">
                {canControlOllama && (
                  <Button size="sm" variant="secondary" className="h-7 text-xs" disabled={ollamaBusy} onClick={onToggleOllama}>
                    {ollamaBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                    <span className="ml-1">Khởi động Ollama</span>
                  </Button>
                )}
                {onOpenSettings && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onOpenSettings}>
                    <Settings2 className="h-3 w-3" />
                    <span className="ml-1">Cài đặt</span>
                  </Button>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
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
            </div>
          </div>
          {bridgeOnline && running.length > 0 && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium flex items-center gap-1.5">
                  <MemoryStick className="h-3 w-3" />
                  Model đang nạp
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {formatBytes(totalRunningBytes)} · {running.length}
                </span>
              </div>
              <div className="space-y-2">
                {running.map((r) => {
                  const cpuBytes = Math.max(0, r.size - r.size_vram);
                  const vramPct = r.size > 0 ? Math.round((r.size_vram / r.size) * 100) : 0;
                  return (
                    <div key={r.name} className="rounded-md border border-border p-2">
                      <div className="font-mono text-xs font-semibold mb-1 truncate">{r.name}</div>
                      <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                        <span>{formatBytes(r.size)}</span>
                        <span className="flex items-center gap-1">
                          <Cpu className="h-3 w-3" />
                          {vramPct}% GPU
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden flex">
                        <div className="bg-[hsl(var(--success))]" style={{ width: `${vramPct}%` }} />
                        <div className="bg-warning/60" style={{ width: `${100 - vramPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="p-2 border-t border-border flex justify-end">
            <UpdateBadge />
          </div>
        </PopoverContent>
      </Popover>

      {/* Search + Settings — frequent */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenSearch}
        title="Tìm trong chat (⌘/Ctrl+F)"
        className="h-8 w-8"
      >
        <Search className="h-3.5 w-3.5" />
      </Button>
      {onOpenSettings && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          title="Cài đặt (⌘,)"
          className="h-8 w-8"
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      )}

      {/* Overflow menu: ít dùng (agent, title, system prompt, export, ollama) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Thêm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
            Hội thoại
          </DropdownMenuLabel>
          <Popover>
            <PopoverTrigger asChild>
              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-2">
                <Sparkles className="h-3.5 w-3.5" /> Đổi tên…
              </DropdownMenuItem>
            </PopoverTrigger>
            <PopoverContent align="end" side="left" className="w-80">
              <div className="space-y-2">
                <Label>Tiêu đề</Label>
                <Input
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  className="h-8"
                  placeholder="New chat"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Tip: đổi tiêu đề giúp tìm lại nhanh hơn trong sidebar.
                </p>
              </div>
            </PopoverContent>
          </Popover>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
            Agent
          </DropdownMenuLabel>
          {AGENTS.map((a) => {
            const Icon = a.icon;
            return (
              <DropdownMenuItem
                key={a.id}
                onClick={() => onAgentChange(a.id)}
                className="gap-2 items-start py-2"
              >
                <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    {a.name}
                    {a.id === agentId && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-mono">
                        active
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground leading-snug">
                    {a.description}
                  </div>
                </div>
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
            Lời nhắc hệ thống
          </DropdownMenuLabel>
          <Popover>
            <PopoverTrigger asChild>
              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-2">
                <Sparkles className="h-3.5 w-3.5" /> Chỉnh hệ thống…
              </DropdownMenuItem>
            </PopoverTrigger>
            <PopoverContent align="end" side="left" className="w-96">
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

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
            Xuất hội thoại
          </DropdownMenuLabel>
          <DropdownMenuItem disabled={!canExport} onClick={() => onExport("markdown")}>
            <FileText className="h-3.5 w-3.5 mr-2" /> Markdown (.md)
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canExport} onClick={() => onExport("json")}>
            <FileJson className="h-3.5 w-3.5 mr-2" /> JSON (.json)
          </DropdownMenuItem>

          {canControlOllama && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onToggleOllama} disabled={ollamaBusy}>
                {ollamaBusy ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <Power className="h-3.5 w-3.5 mr-2" />
                )}
                {ollamaBusy
                  ? bridgeOnline
                    ? "Đang dừng…"
                    : "Đang khởi động…"
                  : bridgeOnline
                    ? "Dừng Ollama"
                    : "Khởi động Ollama"}
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onKillSwitch}
            disabled={!killArmed}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <OctagonX className="h-3.5 w-3.5 mr-2" />
            Dừng khẩn
            {killArmed && <span className="ml-auto text-[10px] opacity-70">Esc</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Inline kill switch — only when agent is armed, for instant access */}
      {killArmed && (
        <Button
          variant="destructive"
          size="sm"
          onClick={onKillSwitch}
          title="Dừng tác nhân ngay lập tức (Esc)"
          className="h-8 font-semibold shadow-[var(--shadow-soft)] animate-fade-in"
        >
          <OctagonX className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">Dừng khẩn</span>
        </Button>
      )}
    </header>
  );
}
