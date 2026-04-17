import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TopBar } from "./TopBar";
import { MessageBubble } from "./MessageBubble";
import { ChatInput, PendingAttachment } from "./ChatInput";
import { OllamaModel, RunningModel, listModels, listRunning, pingOllama, showModel, streamChat } from "@/lib/ollama";
import { chatOnce, OllamaChatMessage } from "@/lib/ollamaTools";
import { streamOpenAI, chatOnceOpenAI, OpenAIMessage, OpenAITool } from "@/lib/openai";
import { TOOLS, TOOLS_BY_NAME, toOllamaTools, toolsForMode, isActionAllowedInMode, ToolDef, effectiveRisk, type ConversationMode } from "@/lib/tools";
import { executeTool, isElectron } from "@/lib/bridge";
import { ToolApprovalDialog } from "./ToolApprovalDialog";
import { ToolCallRecord } from "./ToolCallCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Wrench } from "lucide-react";
import { Artifact, extractArtifacts } from "@/lib/artifacts";
import { ChatEmptyState } from "./ChatEmptyState";
import { AgentPreset } from "@/lib/presets";
import { estimateTokens } from "./TokenMeter";
import { ChatSearch } from "./ChatSearch";
import { estimateCostUsd } from "@/lib/pricing";
import { logActivity } from "@/lib/activityLog";
import { toMarkdown, toJson, downloadFile, safeFilename } from "@/lib/exportConv";
import { notifyDone } from "@/lib/notifications";
import type { CursorPoint } from "./CursorTrailOverlay";

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
  const [mode, setMode] = useState<ConversationMode>("chat");
  const [autoApprove, setAutoApprove] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const [lastReplyStats, setLastReplyStats] = useState<{ tokens: number; tps: number } | null>(null);
  const streamStartRef = useRef<number>(0);

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
    })();
  }, [conversationId, defaultModel]);

  const handleModeChange = async (next: ConversationMode) => {
    setMode(next);
    setToolsEnabled(next === "control");
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

  // Ask user to approve a tool call
  const requestApproval = (tool: ToolDef, args: Record<string, any>) =>
    new Promise<{ approve: boolean; alwaysAllow: boolean }>((resolve) => {
      const risk = effectiveRisk(tool.name, args);
      if (!requireConfirm && risk !== "high") {
        resolve({ approve: true, alwaysAllow: false });
        return;
      }
      if (autoApprove[tool.name] && risk !== "high") {
        resolve({ approve: true, alwaysAllow: false });
        return;
      }
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
    const MAX_STEPS = 8;

    for (let step = 0; step < MAX_STEPS; step++) {
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

        // Vision flow: screenshot → feed image back to model
        const isScreenshot = tc.function.name === "computer" && args.action === "screenshot";
        if (isScreenshot && result.ok && result.image) {
          working.push({
            role: "user",
            content: "[Screenshot attached] Analyze what you see and continue the task.",
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
    const MAX_STEPS = 8;

    for (let step = 0; step < MAX_STEPS; step++) {
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

        // Vision: screenshot → send back as image_url
        const isScreenshot = tc.function.name === "computer" && args.action === "screenshot";
        if (isScreenshot && result.ok && result.image) {
          working.push({
            role: "user",
            content: [
              { type: "text", text: "[Screenshot attached] Analyze what you see and continue the task." },
              { type: "image_url", image_url: { url: `data:image/png;base64,${result.image}` } },
            ],
          });
        }
      }
    }

    return { finalText: "(Tool loop reached max steps)", allCalls };
  };

  // ----- Send -----
  const send = async (text: string, attachments: PendingAttachment[]) => {
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
      const baseSystem = systemPrompt || "";
      const toolsHint = toolsEnabled
        ? "\n\nYou have access to local computer-use tools. Use them when helpful. Always explain what you're doing."
        : "";
      const fullSystem = (baseSystem + toolsHint).trim();

      const history: OllamaChatMessage[] = [];
      if (fullSystem) history.push({ role: "system", content: fullSystem });
      for (const m of [...messages, userMsg as unknown as DbMessage]) {
        if (m.role === "system" || m.role === "tool") continue;
        // Skip empty assistant messages (e.g. from previous failed streams)
        if (m.role === "assistant" && !m.content?.trim()) continue;
        const om: OllamaChatMessage = { role: m.role as any, content: m.content };
        if (m.attachments && m.role === "user") {
          const imgs = m.attachments.map((a) => a.base64).filter(Boolean) as string[];
          if (imgs.length) om.images = imgs;
        }
        history.push(om);
      }

      setIsStreaming(true);
      setStreamingText("");
      setStreamingToolCalls([]);
      streamStartRef.current = performance.now();
      const controller = new AbortController();
      abortRef.current = controller;

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
          },
          onError: (err) => toast.error("Lỗi luồng: " + err.message),
        });
        finalContent = acc;
      }

      setIsStreaming(false);
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
      if (e.name !== "AbortError") toast.error(e.message);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    // Cancel any pending approval
    if (pending) {
      pending.resolve({ approve: false, alwaysAllow: false });
      setPending(null);
    }
  };

  const killSwitch = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    if (pending) {
      pending.resolve({ approve: false, alwaysAllow: false });
      setPending(null);
    }
    setAutoApprove({});
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
      />

      <div className="border-b border-border bg-muted/30 px-4 py-2 flex items-center gap-3">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <Label htmlFor="tools-switch" className="text-sm cursor-pointer">
          Công cụ điều khiển máy {isElectron() ? "(thật)" : "(giả lập — mở trong Electron để dùng thật)"}
        </Label>
        <Switch id="tools-switch" checked={toolsEnabled} onCheckedChange={setToolsEnabled} />
        <span className="text-xs text-muted-foreground">
          {toolsEnabled
            ? `${TOOLS.length} công cụ khả dụng • ${requireConfirm ? "Xác nhận trước khi chạy" : "Tự chạy mức thấp/trung bình"}`
            : "Bật để cho phép AI yêu cầu công cụ"}
        </span>
      </div>

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
        <ScrollArea className="h-full">
          <div ref={scrollRef} className="h-full">
          <div className="max-w-3xl mx-auto px-4">
            {messages.length === 0 && !streamingText && !streamingToolCalls.length && (
              <ChatEmptyState
                bridgeOnline={bridgeOnline}
                ollamaUrl={ollamaUrl}
                onPickPrompt={(p) => send(p, [])}
                onPickPreset={(preset: AgentPreset) => {
                  setSystemPrompt(preset.systemPrompt);
                  setToolsEnabled(preset.toolsEnabled);
                  // Pick model: prefer preset's first matching available model
                  if (provider === "ollama" && preset.preferOllama) {
                    const m = models.find((x) => x.name.includes(preset.preferOllama!));
                    if (m) setModel(m.name);
                  }
                  toast.success(`Đã chọn preset: ${preset.name}`);
                }}
              />
            )}
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                role={m.role}
                content={m.content}
                attachments={m.attachments}
                toolCalls={m.tool_calls}
                messageId={m.id}
                searchQuery={searchOpen ? searchQuery : undefined}
                onArtifactOpen={onArtifactOpen}
                onEditSubmit={m.role === "user" ? (c) => handleEditMessage(m.id, c) : undefined}
                onBranch={() => handleBranch(m.id)}
              />
            ))}
            {isStreaming && (
              <MessageBubble
                role="assistant"
                content={streamingText}
                toolCalls={streamingToolCalls}
                streaming={!streamingText && streamingToolCalls.length === 0}
                messageId="streaming"
                onArtifactOpen={onArtifactOpen}
                onReannotate={handleReannotate}
              />
            )}
            <div className="h-4" />
          </div>
        </div>
        </ScrollArea>
      </div>

      <ChatInput onSend={send} onStop={stop} isStreaming={isStreaming} disabled={!user} />

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

