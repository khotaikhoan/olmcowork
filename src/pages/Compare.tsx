import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Loader2, Save, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { listModels, pingOllama, streamChat, OllamaModel } from "@/lib/ollama";
import { streamOpenAI, OpenAIMessage } from "@/lib/openai";
import { Markdown } from "@/components/chat/Markdown";
import { toast } from "sonner";

interface PaneState {
  provider: "ollama" | "openai";
  model: string;
  output: string;
  streaming: boolean;
  abort: AbortController | null;
  startedAt: number;
  durationMs: number;
}

const OPENAI_MODELS = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "openai/gpt-5-mini",
  "openai/gpt-5",
];

export default function Compare() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [ollamaUrl] = useState("http://localhost:11434");
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [bridgeOnline, setBridgeOnline] = useState(false);
  const [prompt, setPrompt] = useState("");

  const initial = (provider: "ollama" | "openai", model: string): PaneState => ({
    provider,
    model,
    output: "",
    streaming: false,
    abort: null,
    startedAt: 0,
    durationMs: 0,
  });

  const [left, setLeft] = useState<PaneState>(() =>
    initial("openai", "google/gemini-3-flash-preview"),
  );
  const [right, setRight] = useState<PaneState>(() =>
    initial("openai", "openai/gpt-5-mini"),
  );

  useEffect(() => {
    if (!loading && !user) nav("/auth", { replace: true });
  }, [loading, user, nav]);

  useEffect(() => {
    pingOllama(ollamaUrl).then(async (ok) => {
      setBridgeOnline(ok);
      if (ok) {
        try {
          const m = await listModels(ollamaUrl);
          setModels(m);
        } catch {}
      }
    });
  }, [ollamaUrl]);

  const runPane = async (
    pane: PaneState,
    setPane: (p: PaneState | ((prev: PaneState) => PaneState)) => void,
    text: string,
  ) => {
    const ctrl = new AbortController();
    const start = performance.now();
    setPane((p) => ({ ...p, output: "", streaming: true, abort: ctrl, startedAt: start, durationMs: 0 }));
    try {
      if (pane.provider === "openai") {
        const messages: OpenAIMessage[] = [{ role: "user", content: text }];
        let acc = "";
        await streamOpenAI({
          model: pane.model,
          messages,
          signal: ctrl.signal,
          onToken: (chunk) => {
            acc += chunk;
            setPane((p) => ({ ...p, output: acc }));
          },
          onError: (e) => toast.error(`${pane.model}: ${e.message}`),
        });
      } else {
        let acc = "";
        await streamChat({
          baseUrl: ollamaUrl,
          model: pane.model,
          messages: [{ role: "user", content: text }],
          signal: ctrl.signal,
          onToken: (chunk) => {
            acc += chunk;
            setPane((p) => ({ ...p, output: acc }));
          },
          onError: (e) => toast.error(`${pane.model}: ${e.message}`),
        });
      }
    } catch (e: any) {
      if (e.name !== "AbortError") toast.error(e.message);
    } finally {
      setPane((p) => ({
        ...p,
        streaming: false,
        abort: null,
        durationMs: performance.now() - start,
      }));
    }
  };

  const sendBoth = () => {
    const t = prompt.trim();
    if (!t) return;
    runPane(left, setLeft, t);
    runPane(right, setRight, t);
  };

  const stopBoth = () => {
    left.abort?.abort();
    right.abort?.abort();
  };

  const saveBoth = async () => {
    if (!user) return;
    const winner = (pane: PaneState) =>
      `[Compare] ${pane.model} · ${(pane.durationMs / 1000).toFixed(1)}s`;
    for (const pane of [left, right]) {
      if (!pane.output) continue;
      const { data: conv } = await supabase
        .from("conversations")
        .insert({
          user_id: user.id,
          title: winner(pane),
          model: pane.model,
        })
        .select("id")
        .single();
      if (!conv) continue;
      await supabase.from("messages").insert([
        { conversation_id: conv.id, user_id: user.id, role: "user", content: prompt },
        { conversation_id: conv.id, user_id: user.id, role: "assistant", content: pane.output },
      ]);
    }
    toast.success("Đã lưu 2 cuộc hội thoại");
  };

  const isStreaming = left.streaming || right.streaming;

  if (loading || !user) return null;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="h-14 border-b border-border bg-background/80 backdrop-blur flex items-center gap-3 px-4 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => nav("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold">⚖ So sánh 2 model</h1>
        <span className="text-xs text-muted-foreground">
          Chạy cùng prompt qua 2 model song song
        </span>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={saveBoth}
          disabled={!left.output && !right.output}
        >
          <Save className="h-3.5 w-3.5 mr-1" /> Lưu cả 2
        </Button>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-x divide-border min-h-0">
        {[
          { pane: left, setPane: setLeft, label: "A" },
          { pane: right, setPane: setRight, label: "B" },
        ].map(({ pane, setPane, label }) => (
          <div key={label} className="flex flex-col min-h-0">
            <div className="border-b border-border p-3 flex items-center gap-2 bg-muted/20">
              <span className="font-mono text-xs font-bold">{label}</span>
              <Select
                value={`${pane.provider}::${pane.model}`}
                onValueChange={(v) => {
                  const [p, m] = v.split("::");
                  setPane((s) => ({ ...s, provider: p as any, model: m }));
                }}
              >
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">Cloud</div>
                  {OPENAI_MODELS.map((m) => (
                    <SelectItem key={`openai::${m}`} value={`openai::${m}`}>
                      {m}
                    </SelectItem>
                  ))}
                  {bridgeOnline && (
                    <>
                      <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">Local</div>
                      {models.map((m) => (
                        <SelectItem key={`ollama::${m.name}`} value={`ollama::${m.name}`}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {pane.durationMs > 0 && (
                <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                  {(pane.durationMs / 1000).toFixed(1)}s · {pane.output.length}c
                </span>
              )}
              {pane.streaming && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 prose-chat max-w-none">
                {pane.output ? (
                  <Markdown content={pane.output} />
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    Chờ prompt…
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        ))}
      </div>

      <div className="border-t border-border bg-background p-4">
        <div className="max-w-4xl mx-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] focus-within:ring-2 focus-within:ring-ring transition">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                sendBoth();
              }
            }}
            placeholder="Nhập prompt — sẽ chạy song song trên cả A và B…"
            className="min-h-[60px] max-h-40 resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
          />
          <div className="flex justify-end p-2 pt-0">
            {isStreaming ? (
              <Button onClick={stopBoth} variant="destructive" size="sm">
                <Square className="h-3.5 w-3.5 mr-1" /> Dừng cả 2
              </Button>
            ) : (
              <Button onClick={sendBoth} size="sm" disabled={!prompt.trim()}>
                <Send className="h-3.5 w-3.5 mr-1" /> So sánh
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
