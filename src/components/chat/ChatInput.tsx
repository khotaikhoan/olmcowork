import { useRef, useState, KeyboardEvent, useEffect, ClipboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Send, Square, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { UrlPreviewChip, UrlMeta } from "./UrlPreviewChip";

export interface PendingAttachment {
  file: File;
  dataUrl: string;
  base64: string;
}

interface Props {
  onSend: (text: string, attachments: PendingAttachment[]) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

const URL_RE = /^https?:\/\/[^\s]+$/i;

export function ChatInput({ onSend, onStop, isStreaming, disabled }: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [urlPreviews, setUrlPreviews] = useState<UrlMeta[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  // Slash command: /schedule "<name>" <cron> -- <prompt>
  const trySlashCommand = async (raw: string): Promise<boolean> => {
    if (!raw.startsWith("/schedule")) return false;
    if (!user) {
      toast.error("Cần đăng nhập");
      return true;
    }
    const m = raw.match(/^\/schedule\s+"([^"]+)"\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+--\s+([\s\S]+)$/);
    if (!m) {
      toast.error('Cú pháp: /schedule "tên" <cron 5 phần> -- <prompt>');
      return true;
    }
    const [, name, cron, prompt] = m;
    const { error } = await supabase.from("scheduled_jobs").insert({
      user_id: user.id,
      name,
      cron,
      prompt,
      job_type: "cloud",
      enabled: true,
      model: "google/gemini-3-flash-preview",
    });
    if (error) toast.error(error.message);
    else toast.success(`Đã tạo job "${name}" (${cron})`);
    return true;
  };

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 240) + "px";
  }, [text]);

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const list: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const base64 = dataUrl.split(",")[1] || "";
      list.push({ file, dataUrl, base64 });
    }
    setAttachments((p) => [...p, ...list]);
  };

  // Smart paste: detect URL → fetch metadata → show chip
  const fetchMeta = async (url: string) => {
    setUrlPreviews((p) => [...p, { url, loading: true }]);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-meta", {
        body: { url },
      });
      if (error) throw error;
      setUrlPreviews((p) =>
        p.map((m) =>
          m.url === url
            ? {
                ...m,
                loading: false,
                title: data?.title,
                description: data?.description,
                favicon: data?.favicon,
                image: data?.image,
              }
            : m,
        ),
      );
    } catch (e: any) {
      setUrlPreviews((p) =>
        p.map((m) => (m.url === url ? { ...m, loading: false, error: e?.message } : m)),
      );
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text").trim();
    if (URL_RE.test(pasted) && !pasted.includes("\n")) {
      // Don't intercept — let the URL be inserted normally, but also fetch meta in parallel
      if (!urlPreviews.some((m) => m.url === pasted)) fetchMeta(pasted);
    }
  };

  const submit = async () => {
    if (isStreaming) return;
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (await trySlashCommand(trimmed)) {
      setText("");
      setUrlPreviews([]);
      return;
    }
    // Augment prompt with URL metadata so the model has context
    let augmented = trimmed;
    const ready = urlPreviews.filter((m) => !m.loading && (m.title || m.description));
    if (ready.length > 0) {
      const ctx = ready
        .map(
          (m) =>
            `[Đính kèm URL] ${m.url}\nTiêu đề: ${m.title ?? "?"}\nMô tả: ${m.description ?? ""}`,
        )
        .join("\n\n");
      augmented = `${trimmed}\n\n---\n${ctx}`;
    }
    onSend(augmented, attachments);
    setText("");
    setAttachments([]);
    setUrlPreviews([]);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-border bg-background p-4">
      <div
        className="max-w-3xl mx-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] focus-within:ring-2 focus-within:ring-ring transition"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        {(attachments.length > 0 || urlPreviews.length > 0) && (
          <div className="flex gap-2 flex-wrap p-3 pb-0">
            {attachments.map((a, i) => (
              <div key={`img-${i}`} className="relative">
                <img
                  src={a.dataUrl}
                  alt={a.file.name}
                  className="h-16 w-16 object-cover rounded-lg border border-border"
                />
                <button
                  onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:scale-110 transition"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {urlPreviews.map((m) => (
              <UrlPreviewChip
                key={m.url}
                meta={m}
                onRemove={() => setUrlPreviews((p) => p.filter((x) => x.url !== m.url))}
              />
            ))}
          </div>
        )}
        <Textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          placeholder="Nhắn cho Ollama… (Shift+Enter để xuống dòng, kéo thả ảnh, paste URL)"
          disabled={disabled}
          className="min-h-[52px] max-h-60 resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
        />
        <div className="flex items-center justify-between p-2 pt-0">
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
            >
              <ImagePlus className="h-4 w-4 mr-1" />
              Ảnh
            </Button>
          </div>
          {isStreaming ? (
            <Button onClick={onStop} variant="destructive" size="sm">
              <Square className="h-3.5 w-3.5 mr-1" /> Dừng
            </Button>
          ) : (
            <Button onClick={submit} size="sm" disabled={disabled || (!text.trim() && attachments.length === 0)}>
              <Send className="h-3.5 w-3.5 mr-1" /> Gửi
            </Button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground text-center mt-2">
        Kết nối trực tiếp tới Ollama trên máy bạn. Đặt <code className="px-1 bg-muted rounded">OLLAMA_ORIGINS=*</code> khi dùng trong trình duyệt.
      </p>
    </div>
  );
}
