import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TopBar } from "./TopBar";
import { ControlBarCompact, ControlBarFull } from "./ControlBar";
import { BrowserActiveOverlay } from "./BrowserActiveOverlay";
import { MessageBubble } from "./MessageBubble";
import { SmartSuggestions } from "./SmartSuggestions";
import { generateSuggestions } from "@/lib/smartSuggestions";
import { ResumeBanner } from "./ResumeBanner";
import { ChatInput, PendingAttachment } from "./ChatInput";
import {
  saveResumeState,
  loadResumeState,
  clearResumeState,
  buildContinuationPrompt,
  makeThrottledSaver,
  attachmentsToMeta,
  type ResumeState,
} from "@/lib/resumeStream";
import { OllamaModel, RunningModel, listModels, listRunning, pingOllama, showModel, streamChat } from "@/lib/ollama";
import { chatOnce, OllamaChatMessage } from "@/lib/ollamaTools";
import { streamOpenAI, chatOnceOpenAI, OpenAIMessage, OpenAITool } from "@/lib/openai";
import { TOOLS_BY_NAME, toOllamaTools, toolsForMode, isActionAllowedInMode, ToolDef, effectiveRisk, type ConversationMode } from "@/lib/tools";
import { executeTool, isElectron } from "@/lib/bridge";
import { applyContextWindow, getWindowConfig } from "@/lib/contextWindow";
import { ToolApprovalDialog } from "./ToolApprovalDialog";
import { ToolCallRecord } from "./ToolCallCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { Artifact, extractArtifacts } from "@/lib/artifacts";
import { ChatEmptyState } from "./ChatEmptyState";
import { ControlModeBlocker } from "./ControlModeBlocker";
import { PlanCard } from "./PlanCard";
import { streamPlan, shouldGeneratePlan, type PlanStep } from "@/lib/planGen";
import { AgentPreset } from "@/lib/presets";
import { getAgent } from "@/lib/agents";
import { loadTopMemories, formatMemoriesForPrompt, type UserMemory } from "@/lib/memory";
import { modelSupportsVision } from "@/lib/vision";
import { estimateTokens } from "./TokenMeter";
import { ChatSearch } from "./ChatSearch";
import { estimateCostUsd } from "@/lib/pricing";
import { logActivity } from "@/lib/activityLog";
import { toMarkdown, toJson, downloadFile, safeFilename } from "@/lib/exportConv";
import { notifyDone } from "@/lib/notifications";
import type { CursorPoint } from "./CursorTrailOverlay";
import { setOculoState } from "@/components/OculoLogo";
import { getFullAuto, subscribeFullAuto, FULL_AUTO_MAX_STEPS, NORMAL_MAX_STEPS } from "@/lib/fullAuto";
import { isArmed, arm, requiresArmed } from "@/lib/armed";
import { ArmRequestDialog } from "./ArmRequestDialog";
import { Zap, ShieldOff } from "lucide-react";
import { configureOrchestrator, drainRootReports } from "@/lib/agentOrchestrator";
import { getBypass, setBypass, subscribeBypass } from "@/lib/bypassApprovals";

interface DbMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  attachments: { name: string; dataUrl: string; base64?: string }[] | null;
  tool_calls: ToolCallRecord[] | null;
  created_at: string;
}

interface Props {
  conversationId: string | null;
  provider: "ollama" | "openai";
  openaiModel: string;
  ollamaUrl: string;
  defaultModel: string | null;
  requireConfirm: boolean;
  autoStopMinutes: number;
  autoStart: boolean;
  onCreated: (id: string) => void;
  onTitleUpdated: () => void;
  onArtifactsChange?: (artifacts: Artifact[]) => void;
  onArtifactOpen?: (id: string) => void;
  onToggleSidebar?: () => void;
}

export function ChatView({
  conversationId,
  provider,
  openaiModel,
  ollamaUrl,
  defaultModel,
  requireConfirm,
  autoStopMinutes,
  autoStart,
  onCreated,
  onTitleUpdated,
  onArtifactsChange,
  onArtifactOpen,
  onToggleSidebar,
}: Props) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [running, setRunning] = useState<RunningModel[]>([]);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallRecord[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [title, setTitle] = useState("New chat");
  const [model, setModel] = useState<string>("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [toolsEnabled, setToolsEnabled] = useState(false);
  const [controlBarCollapsed, setControlBarCollapsed] = useState<boolean>(
    () => typeof localStorage !== "undefined" && localStorage.getItem("chat.control_bar_collapsed") === "1",
  );
  const setCollapsedPersist = (v: boolean) => {
    setControlBarCollapsed(v);
    try { localStorage.setItem("chat.control_bar_collapsed", v ? "1" : "0"); } catch { /* ignore */ }
  };
  const [mode, setMode] = useState<ConversationMode>("chat");
  const [lockedApp, setLockedApp] = useState<string | null>(null);
  const [autoApprove, setAutoApprove] = useState<Record<string, boolean>>({});
  const [agentId, setAgentId] = useState<string>(() => {
    try { return localStorage.getItem("chat.agentId") || "default"; } catch { return "default"; }
  });
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const [lastReplyStats, setLastReplyStats] = useState<{ tokens: number; tps: number } | null>(null);
  const streamStartRef = useRef<number>(0);

  // Auto-resume: detect interrupted streams from previous session
  const [resumeOffer, setResumeOffer] = useState<ResumeState | null>(null);
  const resumeSavedAtThisSessionRef = useRef<boolean>(false);
  const throttledSaveRef = useRef(makeThrottledSaver(800));
  const latestPartialRef = useRef<{ convId: string; text: string } | null>(null);

  // Flush partial to localStorage synchronously on tab unload — bypasses
  // throttle so we don't lose the last second of streaming.
  useEffect(() => {
    const onBeforeUnload = () => {
      const lp = latestPartialRef.current;
      if (!lp || !isStreaming) return;
      try {
        const raw = localStorage.getItem("chat.resume.v1." + lp.convId);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        parsed.partial = lp.text;
        parsed.updatedAt = Date.now();
        localStorage.setItem("chat.resume.v1." + lp.convId, JSON.stringify(parsed));
      } catch { /* ignore */ }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isStreaming]);

  // Cost tracking — accumulated input/output tokens for the conversation
  const [costInput, setCostInput] = useState(0);
  const [costOutput, setCostOutput] = useState(0);

  // Real model context window (Ollama only). Cloud models default to fallback.
  const [contextWindow, setContextWindow] = useState<number>(128_000);
  const [contextWindowSource, setContextWindowSource] = useState<"real" | "fallback">("fallback");

  // Search overlay
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);

  // Tool approval dialog state
  const [pending, setPending] = useState<{
    tool: ToolDef;
    args: Record<string, any>;
    resolve: (decision: { approve: boolean; alwaysAllow: boolean }) => void;
  } | null>(null);

  // Plan card state (Control mode only) — gates send until user approves/skips.
  const [pendingPlan, setPendingPlan] = useState<{
    prompt: string;
    attachments: PendingAttachment[];
    steps: PlanStep[];
    loading: boolean;
  } | null>(null);

  // Full Auto mode — synced from localStorage via subscribeFullAuto
  const [fullAuto, setFullAutoState] = useState<boolean>(getFullAuto());
  // Agent step counter (visible in topbar badge while looping)
  const [agentStep, setAgentStep] = useState<{ current: number; max: number } | null>(null);
  useEffect(() => subscribeFullAuto(setFullAutoState), []);

  // Bypass Approvals — per-conversation auto-approve all tools (incl. armed/high-risk)
  const [bypass, setBypassState] = useState<boolean>(false);
  useEffect(() => {
    setBypassState(getBypass(conversationId));
    return subscribeBypass((cid, v) => {
      if (cid === conversationId) setBypassState(v);
    });
  }, [conversationId]);

  // Shared bypass toggle — used by both ControlBarFull and ControlBarCompact.
  const handleBypassToggle = (v: boolean) => {
    if (!conversationId) {
      toast.error("Cần mở 1 hội thoại trước");
      return;
    }
    setBypass(conversationId, v);
    if (v) {
      arm(); // auto-arm so deep tools also pass
      toast.warning("Bypass BẬT — mọi tool sẽ tự chạy không hỏi", {
        description: "Chỉ dùng cho hội thoại này. Tắt khi xong.",
      });
    } else {
      toast.success("Bypass đã tắt — quay lại chế độ duyệt thường");
    }
  };

  // Sync user's headless preference to Electron bridge on mount.
  // Default: visible window (false) so user can watch the AI driving Chrome.
  useEffect(() => {
    const headless = localStorage.getItem("chat.browser_headless") === "true";
    (window as any).bridge?.browserSetHeadless?.(headless).catch(() => {});
  }, []);

  // ----- Ollama health + models -----
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const ok = await pingOllama(ollamaUrl);
      if (!alive) return;
      setBridgeOnline(ok);
      if (ok) {
        try {
          const m = await listModels(ollamaUrl);
          if (!alive) return;
          setModels(m);
          setModel((prev) => prev || defaultModel || m[0]?.name || "");
        } catch {}
      } else {
        setRunning([]);
      }
    };
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [ollamaUrl, defaultModel]);

  // ----- Running models (RAM/VRAM) poll -----
  useEffect(() => {
    if (!bridgeOnline) return;
    let alive = true;
    const tick = async () => {
      const r = await listRunning(ollamaUrl);
      if (alive) setRunning(r);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, [bridgeOnline, ollamaUrl]);

  // ----- Context window from Ollama /api/show -----
  useEffect(() => {
    if (provider === "openai") {
      // Cloud models — rough fallback by family
      const m = openaiModel.toLowerCase();
      if (m.includes("gemini")) setContextWindow(1_000_000);
      else if (m.includes("gpt-5")) setContextWindow(400_000);
      else setContextWindow(128_000);
      setContextWindowSource("fallback");
      return;
    }
    if (!bridgeOnline || !model) {
      setContextWindow(128_000);
      setContextWindowSource("fallback");
      return;
    }
    let alive = true;
    showModel(ollamaUrl, model).then((info) => {
      if (!alive) return;
      if (info?.contextLength) {
        setContextWindow(info.contextLength);
        setContextWindowSource("real");
      } else {
        setContextWindow(128_000);
        setContextWindowSource("fallback");
      }
    });
    return () => { alive = false; };
  }, [provider, model, openaiModel, bridgeOnline, ollamaUrl]);

  // ----- Load conversation -----
  useEffect(() => {
    setCostInput(0);
    setCostOutput(0);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchIndex(0);
    if (!conversationId) {
      setMessages([]);
      setTitle("New chat");
      setSystemPrompt("");
      setMode("chat");
      setToolsEnabled(false);
      if (defaultModel) setModel(defaultModel);
      return;
    }
    (async () => {
      const [{ data: conv }, { data: msgs }] = await Promise.all([
        supabase.from("conversations").select("*").eq("id", conversationId).maybeSingle(),
        supabase
          .from("messages")
          .select("id,role,content,attachments,tool_calls,created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true }),
      ]);
      if (conv) {
        setTitle(conv.title);
        setSystemPrompt(conv.system_prompt ?? "");
        if (conv.model) setModel(conv.model);
        const m = ((conv as any).mode as ConversationMode) ?? "chat";
        setMode(m);
        // In control mode the tools toggle is on by default; chat mode keeps it off.
        setToolsEnabled(m === "control");
      }
      setMessages((msgs ?? []) as unknown as DbMessage[]);

      // Detect interrupted stream from previous session
      const saved = loadResumeState(conversationId);
      if (saved && saved.provider === provider) {
        setResumeOffer(saved);
      } else if (saved) {
        // Provider changed — drop the stale state
        clearResumeState(conversationId);
        setResumeOffer(null);
      } else {
        setResumeOffer(null);
      }
    })();
  }, [conversationId, defaultModel, provider]);

  // Persist agent selection
  useEffect(() => {
    try { localStorage.setItem("chat.agentId", agentId); } catch { /* ignore */ }
  }, [agentId]);

  // Phase 5: keep the multi-agent orchestrator in sync with the active
  // provider/model/mode so spawn_agent calls run with the right settings
  // and inherit the parent's allowed tool list.
  useEffect(() => {
    configureOrchestrator({
      provider,
      ollamaUrl,
      defaultOllamaModel: model,
      openaiModel,
      mode,
      parentTools: toolsForMode(mode).map((t) => t.name),
      userId: user?.id ?? null,
      conversationId: conversationId ?? null,
    });
  }, [provider, ollamaUrl, model, openaiModel, mode, user?.id, conversationId]);

  // Load top memories once per user (and refresh when conversation changes)
  useEffect(() => {
    if (!user) return;
    loadTopMemories(user.id).then(setMemories);
  }, [user, conversationId]);

  const handleModeChange = async (next: ConversationMode) => {
    setMode(next);
    setToolsEnabled(next === "control");
    // Behavior learning: auto-collapse the control bar after the user has entered
    // Control mode 5 times. Runs once (guarded by `chat.control_bar_auto_collapsed`)
    // so the user keeps full control afterwards.
    if (next === "control") {
      try {
        const COUNT_KEY = "chat.control_mode_enter_count";
        const DONE_KEY = "chat.control_bar_auto_collapsed";
        const COLLAPSED_KEY = "chat.control_bar_collapsed";
        const count = (parseInt(localStorage.getItem(COUNT_KEY) || "0", 10) || 0) + 1;
        localStorage.setItem(COUNT_KEY, String(count));
        const alreadyAuto = localStorage.getItem(DONE_KEY) === "1";
        const alreadyCollapsed = localStorage.getItem(COLLAPSED_KEY) === "1";
        if (count >= 5 && !alreadyAuto && !alreadyCollapsed) {
          localStorage.setItem(DONE_KEY, "1");
          setCollapsedPersist(true);
          toast.success("Đã thu gọn thanh điều khiển", {
            description: "Bạn dùng Control mode khá thường xuyên — bấm icon trên TopBar để mở rộng lại.",
            duration: 6000,
          });
        }
      } catch { /* ignore */ }
    }
    // Default lock to frontmost app when entering Control mode (Electron only).
    if (next === "control" && !lockedApp && isElectron()) {
      try {
        const b = (window as any).bridge;
        const r = await b?.getFrontmostApp?.();
        if (r?.app) setLockedApp(r.app);
      } catch { /* ignore */ }
    }
    // Phase 2: warn if entering Control with a non-vision Ollama model — observe_screen will be blind.
    if (
      next === "control" &&
      provider === "ollama" &&
      model &&
      !modelSupportsVision(model)
    ) {
      toast.warning(
        `Model "${model}" không có vision — observe_screen sẽ chỉ thấy danh sách marks (không phân tích được pixel). Đề xuất: llava, qwen2.5vl, llama3.2-vision, gemma3.`,
        { duration: 8000 },
      );
    }
    if (next === "chat") setLockedApp(null);
    if (conversationId) {
      await supabase
        .from("conversations")
        .update({ mode: next } as any)
        .eq("id", conversationId);
      onTitleUpdated();
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, streamingToolCalls]);

  // Lift artifacts from messages (+ in-flight stream) up to parent
  useEffect(() => {
    if (!onArtifactsChange) return;
    const all: Artifact[] = [];
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      all.push(...extractArtifacts(m.id, m.content));
    }
    if (isStreaming && streamingText) {
      all.push(...extractArtifacts("streaming", streamingText));
    }
    onArtifactsChange(all);
  }, [messages, streamingText, isStreaming, onArtifactsChange]);

  // Drive the global Oculo logo state — thinking when streaming with no
  // text yet, speaking once tokens arrive, idle otherwise.
  useEffect(() => {
    if (!isStreaming) {
      setOculoState("idle");
      return;
    }
    setOculoState(streamingText ? "speaking" : "thinking");
  }, [isStreaming, streamingText]);

  const persistConv = async (id: string, patch: Partial<{ title: string; model: string; system_prompt: string }>) => {
    await supabase.from("conversations").update(patch).eq("id", id);
    onTitleUpdated();
  };
  const handleTitleChange = async (t: string) => {
    setTitle(t);
    if (conversationId) await persistConv(conversationId, { title: t });
  };
  const handleModelChange = async (m: string) => {
    setModel(m);
    if (conversationId) await persistConv(conversationId, { model: m });
  };
  const handleSystemChange = async (s: string) => {
    setSystemPrompt(s);
    if (conversationId) await persistConv(conversationId, { system_prompt: s });
  };

  const ensureConversation = async (firstUserText: string): Promise<string> => {
    if (conversationId) return conversationId;
    const autoTitle = firstUserText.slice(0, 60) || "New chat";
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        user_id: user!.id,
        title: autoTitle,
        model: provider === "openai" ? openaiModel : model,
        system_prompt: systemPrompt || null,
        mode,
      } as any)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "create failed");
    setTitle(autoTitle);
    onCreated(data.id);
    return data.id;
  };

  // Armed-mode request dialog (Phase 4 deep-system tools)
  const [armRequest, setArmRequest] = useState<{
    toolName: string;
    reason?: string;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const ensureArmed = (toolName: string, reason?: string) =>
    new Promise<boolean>((resolve) => {
      if (isArmed()) return resolve(true);
      setArmRequest({ toolName, reason, resolve });
    });

  // Ask user to approve a tool call.
  // Bypass Approvals: skip ALL approvals (incl. armed-mode) — auto-arm if needed.
  // Phase 4 tools (sudo_shell/run_script/raw_file) ALWAYS require armed-mode,
  // even in Full Auto. Other tools follow the normal Full Auto / require_confirm flow.
  const requestApproval = (tool: ToolDef, args: Record<string, any>) =>
    new Promise<{ approve: boolean; alwaysAllow: boolean }>(async (resolve) => {
      // Bypass: auto-arm + auto-approve everything
      if (bypass) {
        if (requiresArmed(tool.name) && !isArmed()) arm();
        return resolve({ approve: true, alwaysAllow: false });
      }
      if (requiresArmed(tool.name)) {
        const ok = await ensureArmed(tool.name, args.reason ? String(args.reason) : undefined);
        return resolve({ approve: ok, alwaysAllow: false });
      }
      if (fullAuto) return resolve({ approve: true, alwaysAllow: false });
      const risk = effectiveRisk(tool.name, args);
      if (!requireConfirm && risk !== "high") return resolve({ approve: true, alwaysAllow: false });
      if (autoApprove[tool.name] && risk !== "high") return resolve({ approve: true, alwaysAllow: false });
      setPending({ tool, args, resolve });
    });

  // ----- Tool calling loop -----
  const runToolLoop = async (
    convId: string,
    history: OllamaChatMessage[],
    signal: AbortSignal,
  ): Promise<{ finalText: string; allCalls: ToolCallRecord[] }> => {
    const allCalls: ToolCallRecord[] = [];
    const ollamaTools = toOllamaTools(mode);
    let working = [...history];
    const MAX_STEPS = fullAuto ? FULL_AUTO_MAX_STEPS : NORMAL_MAX_STEPS;

    for (let step = 0; step < MAX_STEPS; step++) {
      setAgentStep({ current: step + 1, max: MAX_STEPS });
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      // Phase 6: drain pending child reports → inject so the root agent reacts.
      const reports = drainRootReports();
      if (reports.length > 0) {
        working.push({
          role: "user",
          content: reports
            .map((m) => `[REPORT from ${m.fromName} (${m.fromId.slice(0, 8)})]\n${m.text}`)
            .join("\n\n"),
        });
      }
      const resp = await chatOnce(ollamaUrl, model, working, ollamaTools, signal);

      // No tool calls → final answer
      if (!resp.tool_calls || resp.tool_calls.length === 0) {
        return { finalText: resp.content, allCalls };
      }

      // Append assistant message that requested the tools
      working.push({
        role: "assistant",
        content: resp.content || "",
        tool_calls: resp.tool_calls,
      });

      // Process each tool call sequentially with approval
      for (const tc of resp.tool_calls) {
        const def = TOOLS_BY_NAME[tc.function.name];
        const callId = crypto.randomUUID();
        const args = typeof tc.function.arguments === "string"
          ? safeParse(tc.function.arguments)
          : (tc.function.arguments ?? {});

        const record: ToolCallRecord = {
          id: callId,
          name: tc.function.name,
          args,
          status: "pending",
        };
        allCalls.push(record);
        setStreamingToolCalls([...allCalls]);

        if (!def || !isActionAllowedInMode(mode, tc.function.name, args)) {
          record.status = "error";
          record.result = !def
            ? `Unknown tool: ${tc.function.name}`
            : `Tool '${tc.function.name}' (action=${args.action ?? "?"}) is not allowed in Chat mode. Switch to Control mode for full computer use.`;
          setStreamingToolCalls([...allCalls]);
          working.push({
            role: "tool",
            tool_name: tc.function.name,
            content: record.result,
          });
          continue;
        }

        const decision = await requestApproval(def, args);
        if (!decision.approve) {
          record.status = "denied";
          record.result = "User denied this action.";
          setStreamingToolCalls([...allCalls]);
          working.push({
            role: "tool",
            tool_name: tc.function.name,
            content: "DENIED by user. Do not retry without asking permission.",
          });
          continue;
        }
        if (decision.alwaysAllow) {
          setAutoApprove((p) => ({ ...p, [tc.function.name]: true }));
        }

        record.status = "running";
        setStreamingToolCalls([...allCalls]);
        const result = await executeTool(tc.function.name, args);
        record.status = result.ok ? "done" : "error";
        record.result = result.output;
        if (result.image) record.image = result.image;
        if ((result as any).marks) record.marks = (result as any).marks;

        // Attach accumulated cursor trail to any screenshot result so the
        // overlay can replay the AI's mouse path on top of it.
        if (
          tc.function.name === "computer" &&
          args.action === "screenshot" &&
          result.image
        ) {
          record.trailPoints = collectTrailPoints(allCalls);
        }
        setStreamingToolCalls([...allCalls]);

        working.push({
          role: "tool",
          tool_name: tc.function.name,
          content: result.output,
        });

        // Vision flow: screenshot OR observe_screen OR browser.screenshot → feed image back
        const isVisionCapture =
          (tc.function.name === "computer" && args.action === "screenshot") ||
          tc.function.name === "observe_screen" ||
          (tc.function.name === "browser" && args.action === "screenshot");
        if (isVisionCapture && result.ok && result.image) {
          const note =
            tc.function.name === "observe_screen"
              ? "[Screen observation attached] Use the marks list above + image to pick next vision_click(mark_id) or computer.* action."
              : tc.function.name === "browser"
                ? "[Browser screenshot attached] Decide the next browser.* action (click_selector/fill/navigate)."
                : "[Screenshot attached] Analyze what you see and continue the task.";
          working.push({
            role: "user",
            content: note,
            images: [result.image],
          });
        }
      }
    }

    return { finalText: "(Tool loop reached max steps)", allCalls };
  };

  // ----- OpenAI tool calling loop -----
  const runToolLoopOpenAI = async (
    history: OpenAIMessage[],
    signal: AbortSignal,
  ): Promise<{ finalText: string; allCalls: ToolCallRecord[] }> => {
    const allCalls: ToolCallRecord[] = [];
    const oaiTools: OpenAITool[] = toolsForMode(mode).map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    let working = [...history];
    const MAX_STEPS = fullAuto ? FULL_AUTO_MAX_STEPS : NORMAL_MAX_STEPS;

    for (let step = 0; step < MAX_STEPS; step++) {
      setAgentStep({ current: step + 1, max: MAX_STEPS });
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      // Phase 6: drain pending child reports → inject so the root agent reacts.
      const reports = drainRootReports();
      if (reports.length > 0) {
        working.push({
          role: "user",
          content: reports
            .map((m) => `[REPORT from ${m.fromName} (${m.fromId.slice(0, 8)})]\n${m.text}`)
            .join("\n\n"),
        });
      }
      const resp = await chatOnceOpenAI(openaiModel, working, oaiTools, signal);

      if (!resp.tool_calls || resp.tool_calls.length === 0) {
        return { finalText: resp.content, allCalls };
      }

      // assistant message yêu cầu tool
      working.push({
        role: "assistant",
        content: resp.content || "",
        tool_calls: resp.tool_calls,
      });

      for (const tc of resp.tool_calls) {
        const def = TOOLS_BY_NAME[tc.function.name];
        const callId = crypto.randomUUID();
        const args = typeof tc.function.arguments === "string"
          ? safeParse(tc.function.arguments)
          : (tc.function.arguments ?? {});

        const record: ToolCallRecord = {
          id: callId,
          name: tc.function.name,
          args,
          status: "pending",
        };
        allCalls.push(record);
        setStreamingToolCalls([...allCalls]);

        if (!def) {
          record.status = "error";
          record.result = `Unknown tool: ${tc.function.name}`;
          setStreamingToolCalls([...allCalls]);
          working.push({ role: "tool", tool_call_id: tc.id, content: record.result });
          continue;
        }

        const decision = await requestApproval(def, args);
        if (!decision.approve) {
          record.status = "denied";
          record.result = "User denied this action.";
          setStreamingToolCalls([...allCalls]);
          working.push({ role: "tool", tool_call_id: tc.id, content: "DENIED by user. Do not retry without asking permission." });
          continue;
        }
        if (decision.alwaysAllow) {
          setAutoApprove((p) => ({ ...p, [tc.function.name]: true }));
        }

        record.status = "running";
        setStreamingToolCalls([...allCalls]);
        const result = await executeTool(tc.function.name, args);
        record.status = result.ok ? "done" : "error";
        record.result = result.output;
        if (result.image) record.image = result.image;
        if ((result as any).marks) record.marks = (result as any).marks;
        if (
          tc.function.name === "computer" &&
          args.action === "screenshot" &&
          result.image
        ) {
          record.trailPoints = collectTrailPoints(allCalls);
        }
        setStreamingToolCalls([...allCalls]);

        working.push({ role: "tool", tool_call_id: tc.id, content: result.output });

        // Vision: screenshot OR observe_screen OR browser.screenshot → image_url back to model
        const isVisionCapture =
          (tc.function.name === "computer" && args.action === "screenshot") ||
          tc.function.name === "observe_screen" ||
          (tc.function.name === "browser" && args.action === "screenshot");
        if (isVisionCapture && result.ok && result.image) {
          const note =
            tc.function.name === "observe_screen"
              ? "[Screen observation attached] Use marks list + image to choose next vision_click(mark_id) or computer.* action."
              : tc.function.name === "browser"
                ? "[Browser screenshot attached] Decide the next browser.* action."
                : "[Screenshot attached] Analyze what you see and continue the task.";
          working.push({
            role: "user",
            content: [
              { type: "text", text: note },
              { type: "image_url", image_url: { url: `data:image/png;base64,${result.image}` } },
            ],
          });
        }
      }
    }

    return { finalText: "(Tool loop reached max steps)", allCalls };
  };

  // ----- Send -----
  /**
   * Public send handler. In Control mode with a "complex" prompt, generates a
   * plan first and shows PlanCard for user approval. Otherwise sends immediately.
   */
  // Allows "Bắt đầu sớm" / Retry / Cancel to abort an in-flight plan stream.
  const planAbortRef = useRef<AbortController | null>(null);

  const runPlanGeneration = async (text: string, _attachments: PendingAttachment[]) => {
    planAbortRef.current?.abort();
    const ctrl = new AbortController();
    planAbortRef.current = ctrl;
    try {
      const finalSteps = await streamPlan(text, {
        provider,
        ollamaUrl,
        ollamaModel: model,
        openaiModel,
        signal: ctrl.signal,
        onSteps: (partial) => {
          setPendingPlan((p) => {
            if (!p || p.prompt !== text) return p;
            // If user already started early, p will be null — guarded above.
            return { ...p, steps: partial, loading: true };
          });
        },
      });
      setPendingPlan((p) => {
        if (!p || p.prompt !== text) return p;
        return { ...p, steps: finalSteps, loading: false };
      });
    } catch (err: any) {
      toast.error(`Không tạo được plan: ${err?.message ?? err}`);
      setPendingPlan((p) =>
        p && p.prompt === text ? { ...p, steps: [], loading: false } : p,
      );
    } finally {
      if (planAbortRef.current === ctrl) planAbortRef.current = null;
    }
  };

  const send = async (text: string, attachments: PendingAttachment[]) => {
    if (!user) return;
    // Behavior learning: track total user messages so the empty-state can hide
    // suggestions for power users (≥10 messages). Increment ONCE per send.
    try {
      const KEY = "chat.user_message_count";
      const cur = parseInt(localStorage.getItem(KEY) || "0", 10) || 0;
      localStorage.setItem(KEY, String(cur + 1));
    } catch { /* ignore */ }
    if (mode === "control" && shouldGeneratePlan(text) && !pendingPlan) {
      setPendingPlan({ prompt: text, attachments, steps: [], loading: true });
      await runPlanGeneration(text, attachments);
      return;
    }
    executeSend(text, attachments);
  };

  const executeSend = async (
    text: string,
    attachments: PendingAttachment[],
    planSteps?: PlanStep[],
  ) => {
    if (!user) return;
    lastActivityRef.current = Date.now();

    const usingOpenAI = provider === "openai";

    if (!usingOpenAI) {
      if (!model && models.length === 0 && !(autoStart && isElectron())) {
        return toast.error("Hãy chọn model trước");
      }
      // Tự khởi động Ollama nếu đang dừng (chỉ trên Electron)
      if (!bridgeOnline) {
        if (autoStart && isElectron()) {
          const tid = toast.loading("Đang khởi động Ollama…");
          const b = (window as any).bridge;
          setOllamaBusy(true);
          try {
            const r = await b.startOllama();
            toast.dismiss(tid);
            if (!r.ok) {
              toast.error(r.output);
              return;
            }
            const ok = await pingOllama(ollamaUrl);
            setBridgeOnline(ok);
            if (!ok) return toast.error("Ollama không phản hồi sau khi khởi động.");
            try {
              const m = await listModels(ollamaUrl);
              setModels(m);
              if (!model) setModel(defaultModel || m[0]?.name || "");
            } catch {}
            toast.success("Đã khởi động Ollama.");
          } finally {
            setOllamaBusy(false);
          }
        } else {
          return toast.error("Ollama đang ngoại tuyến. Kiểm tra Cài đặt.");
        }
      }
      if (!model) return toast.error("Hãy chọn model trước");
    }

    try {
      const convId = await ensureConversation(text);
      const atts = attachments.map((a) => ({
        name: a.file.name,
        dataUrl: a.dataUrl,
        base64: a.base64,
      }));

      const { data: userMsg, error: e1 } = await supabase
        .from("messages")
        .insert({
          conversation_id: convId,
          user_id: user.id,
          role: "user",
          content: text,
          attachments: atts.length > 0 ? atts : null,
        })
        .select("id,role,content,attachments,tool_calls,created_at")
        .single();
      if (e1) throw e1;
      setMessages((p) => [...p, userMsg as unknown as DbMessage]);

      // Build Ollama history
      const agent = getAgent(agentId);
      // Agent system prompt overrides the conversation's base system prompt
      // (when agent != "default"); otherwise use the conversation's prompt.
      const baseSystem = agent.systemPrompt || systemPrompt || "";
      const memoryHint = formatMemoriesForPrompt(memories);
      const toolsHint = toolsEnabled
        ? "\n\nYou have access to local computer-use tools. Use them when helpful. Always explain what you're doing."
        : "";
      const planHint =
        planSteps && planSteps.length > 0
          ? `\n\nThe user has approved the following execution plan. Follow these steps in order; announce which step you are on as you go:\n${planSteps
              .map((s, i) => `${i + 1}. ${s.text}`)
              .join("\n")}`
          : "";
      const appLockHint =
        mode === "control" && lockedApp
          ? `\n\n[App focus lock] You may ONLY interact with the application "${lockedApp}". Before any computer/vision_click action, verify the frontmost window belongs to "${lockedApp}". If a different app is focused, switch back (e.g. via vision_annotate then click on the "${lockedApp}" window) instead of acting on it. Never click, type, or send keystrokes into other applications.`
          : "";
      const fullSystem = (baseSystem + memoryHint + toolsHint + planHint + appLockHint).trim();

      // Vision support: only forward image attachments to Ollama if the model
      // accepts them. Cloud models (OpenAI/Gemini) always do via image_url.
      const ollamaVision = provider === "ollama" ? modelSupportsVision(model) : true;
      let droppedImages = false;

      const rawHistory: OllamaChatMessage[] = [];
      if (fullSystem) rawHistory.push({ role: "system", content: fullSystem });
      for (const m of [...messages, userMsg as unknown as DbMessage]) {
        if (m.role === "system" || m.role === "tool") continue;
        // Skip empty assistant messages (e.g. from previous failed streams)
        if (m.role === "assistant" && !m.content?.trim()) continue;
        const om: OllamaChatMessage = { role: m.role as any, content: m.content };
        if (m.attachments && m.role === "user") {
          const imgs = m.attachments.map((a) => a.base64).filter(Boolean) as string[];
          if (imgs.length) {
            if (ollamaVision) om.images = imgs;
            else droppedImages = true;
          }
        }
        rawHistory.push(om);
      }
      if (droppedImages && provider === "ollama") {
        toast.warning(
          `Model "${model}" không hỗ trợ vision — ảnh đã bị bỏ qua. Thử llava, qwen2.5vl, llama3.2-vision.`,
        );
      }

      // Phase A — sliding window + tool-output compression.
      // Chat: 20 turns / 8k chars per old msg. Control: 10 / 4k (tool output is heavy).
      const { history, stats: ctxStats } = applyContextWindow(
        rawHistory,
        getWindowConfig(mode),
      );
      if (ctxStats.droppedMessages > 0 || ctxStats.droppedImageCount > 0 || ctxStats.truncatedMessages > 0) {
        console.log(
          `[context] mode=${mode} kept ${ctxStats.totalOut}/${ctxStats.totalIn} msgs · dropped ${ctxStats.droppedMessages} old · truncated ${ctxStats.truncatedMessages} · dropped ${ctxStats.droppedImageCount} old image(s)`,
        );
        if (ctxStats.droppedMessages >= 5) {
          toast.info(
            `Context đã rút gọn: bỏ ${ctxStats.droppedMessages} lượt cũ${ctxStats.droppedImageCount ? `, ${ctxStats.droppedImageCount} ảnh cũ` : ""}.`,
            { duration: 3000 },
          );
        }
      }

      setIsStreaming(true);
      setStreamingText("");
      setStreamingToolCalls([]);
      streamStartRef.current = performance.now();
      const controller = new AbortController();
      abortRef.current = controller;

      // Resume helper — persists partial text per conversation while streaming.
      // Only used for plain (no-tools) streaming paths; tool loops are not resumable.
      resumeSavedAtThisSessionRef.current = false;
      latestPartialRef.current = null;
      const persistPartial = (acc: string) => {
        if (toolsEnabled) return;
        if (acc.length < 20) return; // avoid noise on first few tokens
        latestPartialRef.current = { convId, text: acc };
        throttledSaveRef.current(() => {
          const lp = latestPartialRef.current;
          if (!lp) return;
          saveResumeState(lp.convId, {
            prompt: text,
            attachmentsMeta: attachmentsToMeta(attachments),
            partial: lp.text,
            provider,
            model: usingOpenAI ? openaiModel : model,
            startedAt: streamStartRef.current,
            updatedAt: Date.now(),
            toolsEnabled: false,
          });
          resumeSavedAtThisSessionRef.current = true;
        });
      };

      let finalContent = "";
      let savedCalls: ToolCallRecord[] = [];

      if (usingOpenAI) {
        // Build OpenAI messages (hỗ trợ vision image_url)
        const oaiMsgs: OpenAIMessage[] = history.map((m) => {
          const imgs = m.images ?? [];
          if (m.role === "user" && imgs.length) {
            return {
              role: "user",
              content: [
                { type: "text", text: m.content },
                ...imgs.map((b64) => ({
                  type: "image_url",
                  image_url: { url: `data:image/png;base64,${b64}` },
                })),
              ],
            };
          }
          return { role: m.role as "system" | "user" | "assistant", content: m.content };
        });

        if (toolsEnabled) {
          // OpenAI + tool loop (non-stream)
          const { finalText, allCalls } = await runToolLoopOpenAI(oaiMsgs, controller.signal);
          finalContent = finalText;
          savedCalls = allCalls;
          setStreamingText(finalText);
        } else {
          let acc = "";
          await streamOpenAI({
            model: openaiModel,
            messages: oaiMsgs,
            signal: controller.signal,
            onToken: (chunk) => {
              acc += chunk;
              setStreamingText(acc);
              persistPartial(acc);
            },
            onError: (err) => toast.error("Lỗi OpenAI: " + err.message),
          });
          finalContent = acc;
        }
      } else if (toolsEnabled) {
        // Tool calling loop (Ollama, non-streaming)
        const { finalText, allCalls } = await runToolLoop(convId, history, controller.signal);
        finalContent = finalText;
        savedCalls = allCalls;
        setStreamingText(finalText);
      } else {
        // Ollama streaming
        let acc = "";
        await streamChat({
          baseUrl: ollamaUrl,
          model,
          messages: history,
          signal: controller.signal,
          onToken: (chunk) => {
            acc += chunk;
            setStreamingText(acc);
            persistPartial(acc);
          },
          onError: (err) => toast.error("Lỗi luồng: " + err.message),
        });
        finalContent = acc;
      }

      // Stream completed normally — clear any saved resume state.
      clearResumeState(convId);
      setResumeOffer(null);

      setIsStreaming(false);
      setAgentStep(null);
      abortRef.current = null;
      const elapsedSec = Math.max(0.001, (performance.now() - streamStartRef.current) / 1000);
      const replyTokens = estimateTokens(finalContent);
      setLastReplyStats({ tokens: replyTokens, tps: replyTokens / elapsedSec });

      if (finalContent || savedCalls.length) {
        const { data: aMsg } = await supabase
          .from("messages")
          .insert({
            conversation_id: convId,
            user_id: user.id,
            role: "assistant",
            content: finalContent,
            tool_calls: savedCalls.length ? (savedCalls as any) : null,
          })
          .select("id,role,content,attachments,tool_calls,created_at")
          .single();
        if (aMsg) setMessages((p) => [...p, aMsg as unknown as DbMessage]);
      }
      setStreamingText("");
      setStreamingToolCalls([]);
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
      onTitleUpdated();
      // Native notification when tab is in background
      notifyDone(title || "Trả lời xong", finalContent || "Hoàn thành tác vụ");
    } catch (e: any) {
      setIsStreaming(false);
      setAgentStep(null);
      if (e.name !== "AbortError") toast.error(e.message);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setAgentStep(null);
    // Cancel any pending approval
    if (pending) {
      pending.resolve({ approve: false, alwaysAllow: false });
      setPending(null);
    }
  };

  // Esc khi đang stream → dừng ngay (đặc biệt quan trọng cho Full Auto)
  useEffect(() => {
    if (!isStreaming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const t = e.target as HTMLElement;
        // Ignore Esc khi đang trong input/textarea (để khỏi cướp khỏi Radix dialog)
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
        e.preventDefault();
        stop();
        toast.message("Đã dừng tác nhân");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  const killSwitch = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    if (pending) {
      pending.resolve({ approve: false, alwaysAllow: false });
      setPending(null);
    }
    setAutoApprove({});
    setAgentStep(null);
    setToolsEnabled(false);
    setStreamingText("");
    setStreamingToolCalls([]);
    toast.error("Đã kích hoạt dừng khẩn — tác nhân dừng, thu hồi quyền tự duyệt, tắt công cụ.");
  };

  const killArmed = isStreaming || !!pending || Object.keys(autoApprove).length > 0 || toolsEnabled;

  // ----- Cost tracking: update after every send -----
  useEffect(() => {
    if (!lastReplyStats) return;
    const inTok = messages.reduce((s, m) => s + estimateTokens(m.content), 0);
    setCostInput(inTok);
    setCostOutput((p) => p + lastReplyStats.tokens);
  }, [lastReplyStats]);

  // ----- Search keyboard shortcut + matches -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searchMatches = searchQuery
    ? messages.filter((m) => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const navigateSearch = (dir: 1 | -1) => {
    if (searchMatches.length === 0) return;
    const next = (searchIndex + dir + searchMatches.length) % searchMatches.length;
    setSearchIndex(next);
    const target = document.querySelector(`[data-message-id="${searchMatches[next].id}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // ----- Export -----
  const handleExport = (format: "markdown" | "json") => {
    const exportable = messages.map((m) => ({
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      attachments: m.attachments,
      tool_calls: m.tool_calls,
    }));
    const fname = safeFilename(title);
    if (format === "markdown") {
      downloadFile(`${fname}.md`, toMarkdown(title, exportable), "text/markdown");
    } else {
      downloadFile(`${fname}.json`, toJson(title, exportable), "application/json");
    }
    toast.success(`Đã xuất ${format.toUpperCase()}`);
  };

  // ----- Edit user message: rewrite + delete trailing + re-send -----
  const handleEditMessage = async (msgId: string, newContent: string) => {
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx < 0 || !conversationId) return;
    const trailing = messages.slice(idx).map((m) => m.id);
    await supabase.from("messages").delete().in("id", trailing);
    const kept = messages.slice(0, idx);
    setMessages(kept);
    await send(newContent, []);
  };

  // ----- Branch: fork conversation up to a message -----
  const handleBranch = async (msgId: string) => {
    if (!user || !conversationId) return;
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    const slice = messages.slice(0, idx + 1);
    const { data: newConv, error } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        title: `${title} (nhánh)`,
        model: provider === "openai" ? openaiModel : model,
        system_prompt: systemPrompt || null,
        branch_of_message_id: msgId,
      })
      .select("id")
      .single();
    if (error || !newConv) return toast.error(error?.message ?? "Branch failed");
    const rows = slice.map((m) => ({
      conversation_id: newConv.id,
      user_id: user.id,
      role: m.role,
      content: m.content,
      attachments: m.attachments as any,
      tool_calls: m.tool_calls as any,
    }));
    if (rows.length) await supabase.from("messages").insert(rows);
    toast.success("Đã tạo nhánh mới");
    onCreated(newConv.id);
  };

  // ----- Re-annotate (auto after vision click) -----
  const handleReannotate = async () => {
    if (!isElectron() || !window.bridge) return;
    const r = await window.bridge.visionAnnotate();
    if (r.ok) {
      const newCall: ToolCallRecord = {
        id: crypto.randomUUID(),
        name: "vision_click",
        args: { action: "annotate" },
        status: "done",
        result: r.output,
        image: (r as any).image,
        marks: (r as any).marks,
      };
      setStreamingToolCalls((p) => [...p, newCall]);
    }
  };

  // ----- Retry tool calls (single + bulk) -----
  // Progress map for bulk retry — keyed by messageId so the bubble can show "Đang thử lại 2/5".
  const [bulkRetry, setBulkRetry] = useState<Record<string, { current: number; total: number }>>({});

  /**
   * Re-run a single tool call by id. Updates local state, persists to DB, and logs activity.
   * Returns whether the retry succeeded so callers (bulk) can decide what to do next.
   */
  const retrySingleCall = async (messageId: string, callId: string, opts: { silent?: boolean } = {}): Promise<boolean> => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !msg.tool_calls) return false;
    const call = msg.tool_calls.find((c) => c.id === callId);
    if (!call) return false;
    const tool = TOOLS_BY_NAME[call.name];
    if (!tool) {
      if (!opts.silent) toast.error(`Không tìm thấy định nghĩa tool: ${call.name}`);
      return false;
    }
    if (mode === "control" && !isActionAllowedInMode(mode, call.name, call.args)) {
      if (!opts.silent) toast.error("Hành động này không được phép trong chế độ hiện tại");
      return false;
    }
    const setStatus = (status: ToolCallRecord["status"], extra: Partial<ToolCallRecord> = {}) => {
      setMessages((prev) =>
        prev.map((mm) =>
          mm.id === messageId
            ? {
                ...mm,
                tool_calls:
                  mm.tool_calls?.map((c) =>
                    c.id === callId ? { ...c, status, ...extra } : c,
                  ) ?? null,
              }
            : mm,
        ),
      );
    };
    setStatus("running");
    if (!opts.silent) toast.info(`Đang chạy lại: ${call.name}`);
    try {
      const r = await executeTool(call.name, call.args);
      const updated: Partial<ToolCallRecord> = {
        result: r.output,
        ...(r.image ? { image: r.image } : {}),
        ...(r.marks ? { marks: r.marks } : {}),
      };
      const newStatus: ToolCallRecord["status"] = r.ok ? "done" : "error";
      setStatus(newStatus, updated);
      const next = (msg.tool_calls ?? []).map((c) =>
        c.id === callId ? { ...c, status: newStatus, ...updated } : c,
      );
      await supabase
        .from("messages")
        .update({ tool_calls: next as any })
        .eq("id", messageId);
      logActivity({
        user_id: user!.id,
        tool_name: call.name,
        args: call.args,
        status: r.ok ? "done" : "error",
        output: r.output,
        risk: effectiveRisk(call.name, call.args),
        conversation_id: conversationId ?? null,
        message_id: messageId,
      });
      if (!opts.silent) toast[r.ok ? "success" : "error"](r.ok ? "Chạy lại thành công" : "Vẫn lỗi");
      return r.ok;
    } catch (e: any) {
      setStatus("error", { result: String(e?.message || e) });
      if (!opts.silent) toast.error(`Lỗi: ${e?.message || e}`);
      return false;
    }
  };

  const handleRetryTool = (messageId: string, callId: string) => {
    void retrySingleCall(messageId, callId);
  };

  /** Retry every failed tool call in a message, sequentially with progress feedback. */
  const handleRetryAllFailed = async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || !msg.tool_calls) return;
    const failedIds = msg.tool_calls.filter((c) => c.status === "error").map((c) => c.id);
    if (failedIds.length === 0) return;
    let okCount = 0;
    setBulkRetry((p) => ({ ...p, [messageId]: { current: 0, total: failedIds.length } }));
    toast.info(`Bắt đầu chạy lại ${failedIds.length} tool lỗi…`);
    try {
      for (let i = 0; i < failedIds.length; i++) {
        setBulkRetry((p) => ({ ...p, [messageId]: { current: i + 1, total: failedIds.length } }));
        const ok = await retrySingleCall(messageId, failedIds[i], { silent: true });
        if (ok) okCount++;
      }
      const failed = failedIds.length - okCount;
      if (failed === 0) toast.success(`Tất cả ${okCount} tool đã chạy lại thành công`);
      else toast.warning(`${okCount}/${failedIds.length} thành công, ${failed} vẫn lỗi`);
    } finally {
      setBulkRetry((p) => {
        const { [messageId]: _omit, ...rest } = p;
        return rest;
      });
    }
  };

  const costModel = provider === "openai" ? openaiModel : model;

  // ----- Ollama process control (Electron only) -----
  const [ollamaBusy, setOllamaBusy] = useState(false);
  const canControlOllama = isElectron();
  const toggleOllama = async () => {
    const b = (window as any).bridge;
    if (!b?.startOllama || !b?.stopOllama) return;
    setOllamaBusy(true);
    try {
      const r = bridgeOnline ? await b.stopOllama() : await b.startOllama();
      toast[r.ok ? "success" : "error"](r.output);
      // Re-ping immediately
      const ok = await pingOllama(ollamaUrl);
      setBridgeOnline(ok);
      if (ok) {
        try {
          const m = await listModels(ollamaUrl);
          setModels(m);
        } catch {}
      } else {
        setModels([]);
      }
    } finally {
      setOllamaBusy(false);
    }
  };

  // ----- Auto-stop Ollama after idle -----
  useEffect(() => {
    if (!canControlOllama || autoStopMinutes <= 0) return;
    const idleMs = autoStopMinutes * 60 * 1000;
    const id = setInterval(async () => {
      if (!bridgeOnline || isStreaming || ollamaBusy) return;
      if (Date.now() - lastActivityRef.current < idleMs) return;
      const b = (window as any).bridge;
      if (!b?.stopOllama) return;
      setOllamaBusy(true);
      try {
        const r = await b.stopOllama();
        if (r.ok) {
          toast.info(`Đã tự dừng Ollama sau ${autoStopMinutes} phút không hoạt động (đã giải phóng RAM).`);
          setBridgeOnline(false);
          setModels([]);
        }
      } finally {
        setOllamaBusy(false);
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [canControlOllama, autoStopMinutes, bridgeOnline, isStreaming, ollamaBusy]);

  return (
    <div className="flex-1 flex flex-col h-screen min-w-0">
      <BrowserActiveOverlay />
      <TopBar
        title={title}
        models={models}
        model={model}
        onModelChange={handleModelChange}
        systemPrompt={systemPrompt}
        onSystemPromptChange={handleSystemChange}
        bridgeOnline={bridgeOnline}
        onTitleChange={handleTitleChange}
        onKillSwitch={killSwitch}
        killArmed={killArmed}
        canControlOllama={canControlOllama}
        ollamaBusy={ollamaBusy}
        onToggleOllama={toggleOllama}
        running={running}
        totalTokens={messages.reduce((s, m) => s + estimateTokens(m.content), 0) + estimateTokens(streamingText)}
        lastReplyTokens={lastReplyStats?.tokens}
        tokensPerSecond={lastReplyStats?.tps}
        inputTokens={costInput}
        outputTokens={costOutput}
        totalCostUsd={estimateCostUsd(costModel, costInput, costOutput)}
        costModel={costModel}
        onOpenSearch={() => setSearchOpen(true)}
        onExport={handleExport}
        canExport={messages.length > 0}
        contextWindow={contextWindow}
        contextWindowSource={contextWindowSource}
        onToggleSidebar={onToggleSidebar}
        mode={mode}
        onModeChange={handleModeChange}
        lockedApp={lockedApp}
        onLockedAppChange={setLockedApp}
        agentId={agentId}
        onAgentChange={(id) => {
          setAgentId(id);
          // Auto-pick a preferred model for this agent if available
          const a = getAgent(id);
          if (provider === "ollama" && a.preferOllama) {
            const m = models.find((x) => x.name.toLowerCase().includes(a.preferOllama!.toLowerCase()));
            if (m && m.name !== model) handleModelChange(m.name);
          }
          if (id !== "default") toast.success(`Đang dùng agent: ${a.name}`);
        }}
        extraSlot={
          mode === "control" && controlBarCollapsed ? (
            <ControlBarCompact
              toolsEnabled={toolsEnabled}
              onToolsEnabledChange={setToolsEnabled}
              bypass={bypass}
              onBypassChange={handleBypassToggle}
              requireConfirm={requireConfirm}
              collapsed={controlBarCollapsed}
              onCollapsedChange={setCollapsedPersist}
            />
          ) : null
        }
      />

      {mode === "control" ? (
        controlBarCollapsed ? null : (
          <ControlBarFull
            toolsEnabled={toolsEnabled}
            onToolsEnabledChange={setToolsEnabled}
            bypass={bypass}
            onBypassChange={handleBypassToggle}
            requireConfirm={requireConfirm}
            collapsed={controlBarCollapsed}
            onCollapsedChange={setCollapsedPersist}
          />
        )
      ) : (
        <div className="border-b border-border bg-muted/30 px-4 py-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          Chế độ Chat — chỉ trò chuyện, không thao tác máy. Có thể đọc file/URL khi cần.
        </div>
      )}

      <div className="flex-1 relative min-h-0">
        <ChatSearch
          open={searchOpen}
          onClose={() => { setSearchOpen(false); setSearchQuery(""); }}
          query={searchQuery}
          onQueryChange={(q) => { setSearchQuery(q); setSearchIndex(0); }}
          matchCount={searchMatches.length}
          currentIndex={searchIndex}
          onNavigate={navigateSearch}
        />
        {/* Full Auto agent step badge — pinned top center while loop runs */}
        {agentStep && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 animate-fade-in">
            <div
              className={
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-soft)] backdrop-blur " +
                (fullAuto
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background/80 text-muted-foreground")
              }
            >
              {fullAuto && <Zap className="h-3.5 w-3.5 fill-current" />}
              <span>
                {fullAuto ? "Full Auto" : "Agent"} · Bước {agentStep.current}/{agentStep.max}
              </span>
              <kbd className="ml-1 px-1.5 py-0.5 rounded bg-background/60 border border-border font-mono text-[10px]">
                Esc
              </kbd>
            </div>
          </div>
        )}
        <ScrollArea className="h-full">
          <div ref={scrollRef} className="h-full">
          <div className="max-w-3xl mx-auto px-4">
            {messages.length === 0 && !streamingText && !streamingToolCalls.length && (
              <ChatEmptyState
                bridgeOnline={bridgeOnline}
                ollamaUrl={ollamaUrl}
                mode={mode}
                onModeChange={handleModeChange}
                onPickPrompt={(p) => send(p, [])}
                onPickPreset={(preset: AgentPreset) => {
                  setSystemPrompt(preset.systemPrompt);
                  setToolsEnabled(preset.toolsEnabled && mode === "control");
                  if (provider === "ollama" && preset.preferOllama) {
                    const m = models.find((x) => x.name.includes(preset.preferOllama!));
                    if (m) setModel(m.name);
                  }
                  toast.success(`Đã chọn preset: ${preset.name}`);
                }}
              />
            )}
            {resumeOffer && (
              <ResumeBanner
                state={resumeOffer}
                onResume={() => {
                  const cont = buildContinuationPrompt(resumeOffer);
                  clearResumeState(conversationId);
                  setResumeOffer(null);
                  executeSend(cont, []);
                }}
                onDismiss={() => {
                  clearResumeState(conversationId);
                  setResumeOffer(null);
                }}
              />
            )}
            {messages.map((m, idx) => {
              const isLastAssistant =
                m.role === "assistant" &&
                !isStreaming &&
                !pendingPlan &&
                idx === messages.length - 1;
              return (
                <div key={m.id}>
                  <MessageBubble
                    role={m.role}
                    content={m.content}
                    attachments={m.attachments}
                    toolCalls={m.tool_calls}
                    messageId={m.id}
                    searchQuery={searchOpen ? searchQuery : undefined}
                    onArtifactOpen={onArtifactOpen}
                    onEditSubmit={m.role === "user" ? (c) => handleEditMessage(m.id, c) : undefined}
                    onBranch={() => handleBranch(m.id)}
                    onRetryTool={(callId) => handleRetryTool(m.id, callId)}
                    onRetryAllFailed={() => handleRetryAllFailed(m.id)}
                    bulkRetryProgress={bulkRetry[m.id] ?? null}
                  />
                  {isLastAssistant && (
                    <div className="ml-11 -mt-2 mb-2 max-w-[80%]">
                      <SmartSuggestions
                        suggestions={generateSuggestions(m.content, m.tool_calls)}
                        onPick={(prompt) =>
                          window.dispatchEvent(
                            new CustomEvent("chat-input:fill", { detail: { text: prompt } }),
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {isStreaming && (
              <MessageBubble
                role="assistant"
                content={streamingText}
                toolCalls={streamingToolCalls}
                streaming={true}
                messageId="streaming"
                onArtifactOpen={onArtifactOpen}
                onReannotate={handleReannotate}
                onSkipThinking={() => {
                  stop();
                  toast.message("Đã dừng phần suy nghĩ");
                }}
              />
            )}
            <div className="h-4" />
          </div>
        </div>
        </ScrollArea>
      </div>

      {pendingPlan && (
        <div className="px-4 pt-3 max-w-3xl w-full mx-auto">
          <PlanCard
            steps={pendingPlan.steps}
            loading={pendingPlan.loading}
            empty={!pendingPlan.loading && pendingPlan.steps.length === 0}
            onRetry={() => {
              planAbortRef.current?.abort();
              const { prompt, attachments } = pendingPlan;
              setPendingPlan({ prompt, attachments, steps: [], loading: true });
              runPlanGeneration(prompt, attachments);
            }}
            onApprove={(approvedSteps) => {
              // Early start: abort any in-flight stream so we don't waste tokens.
              const wasLoading = pendingPlan.loading;
              planAbortRef.current?.abort();
              const { prompt, attachments } = pendingPlan;
              setPendingPlan(null);
              if (wasLoading) {
                toast.info(`Bắt đầu sớm với ${approvedSteps.length} bước.`);
              }
              // Persist approved plan to history (fire-and-forget).
              if (user) {
                supabase
                  .from("approved_plans")
                  .insert({
                    user_id: user.id,
                    conversation_id: conversationId,
                    prompt,
                    steps: approvedSteps as any,
                    step_count: approvedSteps.length,
                    was_early_start: wasLoading,
                    model: provider === "openai" ? openaiModel : model,
                    provider,
                  })
                  .then(({ error }) => {
                    if (error) console.error("Save plan failed:", error);
                  });
              }
              executeSend(prompt, attachments, approvedSteps);
            }}
            onSkip={() => {
              planAbortRef.current?.abort();
              const { prompt, attachments } = pendingPlan;
              setPendingPlan(null);
              executeSend(prompt, attachments);
            }}
            onCancel={() => {
              planAbortRef.current?.abort();
              toast.message("Đã huỷ task. Gõ lại nếu muốn chạy.");
              setPendingPlan(null);
            }}
          />
        </div>
      )}

      {mode === "control" && !isElectron() ? (
        <ControlModeBlocker onSwitchToChat={() => handleModeChange("chat")} />
      ) : (
        <ChatInput
          onSend={send}
          onStop={stop}
          isStreaming={isStreaming || !!pendingPlan}
          disabled={!user || !!pendingPlan}
        />
      )}

      <ToolApprovalDialog
        open={!!pending}
        tool={pending?.tool ?? null}
        args={pending?.args ?? null}
        onApprove={(alwaysAllow) => {
          pending?.resolve({ approve: true, alwaysAllow });
          setPending(null);
        }}
        onDeny={() => {
          pending?.resolve({ approve: false, alwaysAllow: false });
          setPending(null);
        }}
      />

      <ArmRequestDialog
        open={!!armRequest}
        toolName={armRequest?.toolName ?? null}
        reason={armRequest?.reason}
        onApprove={() => {
          arm();
          armRequest?.resolve(true);
          setArmRequest(null);
        }}
        onDeny={() => {
          armRequest?.resolve(false);
          setArmRequest(null);
        }}
      />
    </div>
  );
}

function safeParse(s: string): Record<string, any> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/**
 * Walk through the calls collected so far in the loop and pull out every
 * cursor waypoint (mouse_move, click, key, type) so the screenshot overlay
 * can replay the AI's path.
 */
function collectTrailPoints(allCalls: ToolCallRecord[]): CursorPoint[] {
  const pts: CursorPoint[] = [];
  for (const c of allCalls) {
    if (c.name !== "computer") continue;
    const a = c.args || {};
    const action = String(a.action ?? "");
    const coord = Array.isArray(a.coordinate) ? a.coordinate : null;
    if (coord && typeof coord[0] === "number" && typeof coord[1] === "number") {
      pts.push({
        x: coord[0],
        y: coord[1],
        kind: action || "move",
      });
    }
  }
  return pts;
}

