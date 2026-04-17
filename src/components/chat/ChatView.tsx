import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TopBar } from "./TopBar";
import { MessageBubble } from "./MessageBubble";
import { ChatInput, PendingAttachment } from "./ChatInput";
import { OllamaModel, RunningModel, listModels, listRunning, pingOllama, streamChat } from "@/lib/ollama";
import { chatOnce, OllamaChatMessage } from "@/lib/ollamaTools";
import { TOOLS, TOOLS_BY_NAME, toOllamaTools, ToolDef } from "@/lib/tools";
import { executeTool, isElectron } from "@/lib/bridge";
import { ToolApprovalDialog } from "./ToolApprovalDialog";
import { ToolCallRecord } from "./ToolCallCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Bot, Wrench } from "lucide-react";

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
  ollamaUrl: string;
  defaultModel: string | null;
  requireConfirm: boolean;
  autoStopMinutes: number;
  autoStart: boolean;
  onCreated: (id: string) => void;
  onTitleUpdated: () => void;
}

export function ChatView({
  conversationId,
  ollamaUrl,
  defaultModel,
  requireConfirm,
  autoStopMinutes,
  autoStart,
  onCreated,
  onTitleUpdated,
}: Props) {
  const { user } = useAuth();
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
  const [autoApprove, setAutoApprove] = useState<Record<string, boolean>>({});
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());

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

  // ----- Load conversation -----
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setTitle("New chat");
      setSystemPrompt("");
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
      }
      setMessages((msgs ?? []) as unknown as DbMessage[]);
    })();
  }, [conversationId, defaultModel]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, streamingToolCalls]);

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
        model,
        system_prompt: systemPrompt || null,
      })
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
      // skip dialog when allowed
      if (!requireConfirm && tool.risk !== "high") {
        resolve({ approve: true, alwaysAllow: false });
        return;
      }
      if (autoApprove[tool.name] && tool.risk !== "high") {
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
    const ollamaTools = toOllamaTools();
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

        if (!def) {
          record.status = "error";
          record.result = `Unknown tool: ${tc.function.name}`;
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
        setStreamingToolCalls([...allCalls]);

        working.push({
          role: "tool",
          tool_name: tc.function.name,
          content: result.output,
        });

        // Vision flow: feed screenshot back to the model as a user image message
        if (tc.function.name === "screenshot" && result.ok && result.image) {
          working.push({
            role: "user",
            content: "[Screenshot result attached] Analyze what you see on the screen and continue the task.",
            images: [result.image],
          });
          // Also surface in the UI tool card
          record.result = (record.result || "") + "\n[image sent to vision model]";
          setStreamingToolCalls([...allCalls]);
        }
      }
    }

    return { finalText: "(Tool loop reached max steps)", allCalls };
  };

  // ----- Send -----
  const send = async (text: string, attachments: PendingAttachment[]) => {
    if (!user) return;
    if (!model) return toast.error("Select a model first");
    if (!bridgeOnline) return toast.error("Ollama is offline. Check Settings.");
    lastActivityRef.current = Date.now();

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
      const controller = new AbortController();
      abortRef.current = controller;

      let finalContent = "";
      let savedCalls: ToolCallRecord[] = [];

      if (toolsEnabled) {
        // Tool calling loop (non-streaming)
        const { finalText, allCalls } = await runToolLoop(convId, history, controller.signal);
        finalContent = finalText;
        savedCalls = allCalls;
        setStreamingText(finalText);
      } else {
        // Pure streaming
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
          onError: (err) => toast.error("Stream error: " + err.message),
        });
        finalContent = acc;
      }

      setIsStreaming(false);
      abortRef.current = null;

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
    toast.error("Kill switch activated — agent stopped, auto-approvals revoked, tools disabled.");
  };

  const killArmed = isStreaming || !!pending || Object.keys(autoApprove).length > 0 || toolsEnabled;

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
          toast.info(`Ollama auto-stopped after ${autoStopMinutes}m idle (RAM freed).`);
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
      />

      <div className="border-b border-border bg-muted/30 px-4 py-2 flex items-center gap-3">
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <Label htmlFor="tools-switch" className="text-sm cursor-pointer">
          Computer-use tools {isElectron() ? "(live)" : "(mock — open in Electron for real bridge)"}
        </Label>
        <Switch id="tools-switch" checked={toolsEnabled} onCheckedChange={setToolsEnabled} />
        <span className="text-xs text-muted-foreground">
          {toolsEnabled
            ? `${TOOLS.length} tools available • ${requireConfirm ? "Confirm before run" : "Auto-run low/medium"}`
            : "Toggle on to let the AI request tool calls"}
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="h-full">
          <div className="max-w-3xl mx-auto px-4">
            {messages.length === 0 && !streamingText && !streamingToolCalls.length && (
              <div className="flex flex-col items-center justify-center text-center py-24">
                <div className="h-14 w-14 rounded-2xl bg-[image:var(--gradient-primary)] flex items-center justify-center mb-4">
                  <Bot className="h-7 w-7 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-semibold mb-2">Chat with your local AI</h2>
                <p className="text-muted-foreground max-w-md">
                  Pick a model from the dropdown above and start a conversation. Enable
                  computer-use tools to let the AI read files, run commands, and more.
                </p>
                {!bridgeOnline && (
                  <p className="text-sm text-destructive mt-4 max-w-md">
                    Can't reach Ollama at <code className="px-1 bg-muted rounded">{ollamaUrl}</code>.
                    Make sure it's running with <code className="px-1 bg-muted rounded">OLLAMA_ORIGINS=*</code>.
                  </p>
                )}
              </div>
            )}
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                role={m.role}
                content={m.content}
                attachments={m.attachments}
                toolCalls={m.tool_calls}
              />
            ))}
            {isStreaming && (
              <MessageBubble
                role="assistant"
                content={streamingText}
                toolCalls={streamingToolCalls}
                streaming={!streamingText && streamingToolCalls.length === 0}
              />
            )}
            <div className="h-4" />
          </div>
        </div>
      </ScrollArea>

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
