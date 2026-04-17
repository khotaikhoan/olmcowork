import { useRef, useState, KeyboardEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Send, Square, X } from "lucide-react";

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

export function ChatInput({ onSend, onStop, isStreaming, disabled }: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const submit = () => {
    if (isStreaming) return;
    if (!text.trim() && attachments.length === 0) return;
    onSend(text.trim(), attachments);
    setText("");
    setAttachments([]);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
        {attachments.length > 0 && (
          <div className="flex gap-2 flex-wrap p-3 pb-0">
            {attachments.map((a, i) => (
              <div key={i} className="relative">
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
          </div>
        )}
        <Textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder="Message Ollama… (Shift+Enter for newline, drop images to attach)"
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
              Image
            </Button>
          </div>
          {isStreaming ? (
            <Button onClick={onStop} variant="destructive" size="sm">
              <Square className="h-3.5 w-3.5 mr-1" /> Stop
            </Button>
          ) : (
            <Button onClick={submit} size="sm" disabled={disabled || (!text.trim() && attachments.length === 0)}>
              <Send className="h-3.5 w-3.5 mr-1" /> Send
            </Button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground text-center mt-2">
        Connects directly to your local Ollama. Set <code className="px-1 bg-muted rounded">OLLAMA_ORIGINS=*</code> when using in browser.
      </p>
    </div>
  );
}
