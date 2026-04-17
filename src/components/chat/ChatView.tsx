import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TopBar } from "./TopBar";
import { MessageBubble } from "./MessageBubble";
import { ChatInput, PendingAttachment } from "./ChatInput";
import { OllamaModel, listModels, pingOllama, streamChat, OllamaChatMessage } from "@/lib/ollama";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Bot } from "lucide-react";

interface DbMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  attachments: { name: string; dataUrl: string; base64?: string }[] | null;
  created_at: string;
}

interface Props {
  conversationId: string | null;
  ollamaUrl: string;
  defaultModel: string | null;
  onCreated: (id: string) => void;
  onTitleUpdated: () => void;
}

export function ChatView({ conversationId, ollamaUrl, defaultModel, onCreated, onTitleUpdated }: Props) {
  const { user } = useAuth();
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [title, setTitle] = useState("New chat");
  const [model, setModel] = useState<string>("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load models + ping
  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await pingOllama(ollamaUrl);
      if (!alive) return;
      setBridgeOnline(ok);
      if (ok) {
        try {
          const m = await listModels(ollamaUrl);
          if (!alive) return;
          setModels(m);
          if (!model && (defaultModel || m[0])) {
            setModel(defaultModel || m[0].name);
          }
        } catch (e: any) {
          toast.error("Failed to list models: " + e.message);
        }
      }
    })();
    const interval = setInterval(async () => {
      const ok = await pingOllama(ollamaUrl);
      setBridgeOnline(ok);
    }, 15000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ollamaUrl]);

  // Load conversation
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
          .select("id,role,content,attachments,created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true }),
      ]);
      if (conv) {
        setTitle(conv.title);
        setSystemPrompt(conv.system_prompt ?? "");
        if (conv.model) setModel(conv.model);
      }
      setMessages((msgs ?? []) as DbMessage[]);
    })();
  }, [conversationId, defaultModel]);

  // autoscroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText]);

  const persistTitleModel = async (id: string, patch: Partial<{ title: string; model: string; system_prompt: string }>) => {
    await supabase.from("conversations").update(patch).eq("id", id);
    onTitleUpdated();
  };

  const handleTitleChange = async (t: string) => {
    setTitle(t);
    if (conversationId) await persistTitleModel(conversationId, { title: t });
  };
  const handleModelChange = async (m: string) => {
    setModel(m);
    if (conversationId) await persistTitleModel(conversationId, { model: m });
  };
  const handleSystemChange = async (s: string) => {
    setSystemPrompt(s);
    if (conversationId) await persistTitleModel(conversationId, { system_prompt: s });
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

  const send = async (text: string, attachments: PendingAttachment[]) => {
    if (!user) return;
    if (!model) return toast.error("Select a model first");
    if (!bridgeOnline) return toast.error("Ollama is offline. Check Settings.");

    try {
      const convId = await ensureConversation(text);
      const atts = attachments.map((a) => ({
        name: a.file.name,
        dataUrl: a.dataUrl,
        base64: a.base64,
      }));

      // insert user message
      const { data: userMsg, error: e1 } = await supabase
        .from("messages")
        .insert({
          conversation_id: convId,
          user_id: user.id,
          role: "user",
          content: text,
          attachments: atts.length > 0 ? atts : null,
        })
        .select("id,role,content,attachments,created_at")
        .single();
      if (e1) throw e1;
      setMessages((p) => [...p, userMsg as DbMessage]);

      // build ollama messages
      const history: OllamaChatMessage[] = [];
      if (systemPrompt) history.push({ role: "system", content: systemPrompt });
      for (const m of [...messages, userMsg as DbMessage]) {
        if (m.role === "system") continue;
        const om: OllamaChatMessage = { role: m.role as any, content: m.content };
        if (m.attachments && m.role === "user") {
          const imgs = m.attachments.map((a) => a.base64).filter(Boolean) as string[];
          if (imgs.length) om.images = imgs;
        }
        history.push(om);
      }

      // stream
      setIsStreaming(true);
      setStreamingText("");
      const controller = new AbortController();
      abortRef.current = controller;
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
      setIsStreaming(false);
      abortRef.current = null;

      if (acc) {
        const { data: aMsg } = await supabase
          .from("messages")
          .insert({
            conversation_id: convId,
            user_id: user.id,
            role: "assistant",
            content: acc,
          })
          .select("id,role,content,attachments,created_at")
          .single();
        if (aMsg) setMessages((p) => [...p, aMsg as DbMessage]);
      }
      setStreamingText("");
      // bump updated_at
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
      onTitleUpdated();
    } catch (e: any) {
      setIsStreaming(false);
      toast.error(e.message);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
  };

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
      />

      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="h-full">
          <div className="max-w-3xl mx-auto px-4">
            {messages.length === 0 && !streamingText && (
              <div className="flex flex-col items-center justify-center text-center py-24">
                <div className="h-14 w-14 rounded-2xl bg-[image:var(--gradient-primary)] flex items-center justify-center mb-4">
                  <Bot className="h-7 w-7 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-semibold mb-2">Chat with your local AI</h2>
                <p className="text-muted-foreground max-w-md">
                  Pick a model from the dropdown above and start a conversation. Your messages are
                  stored securely in the cloud and synced across devices.
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
              />
            ))}
            {isStreaming && (
              <MessageBubble role="assistant" content={streamingText} streaming />
            )}
            <div className="h-4" />
          </div>
        </div>
      </ScrollArea>

      <ChatInput onSend={send} onStop={stop} isStreaming={isStreaming} disabled={!user} />
    </div>
  );
}
