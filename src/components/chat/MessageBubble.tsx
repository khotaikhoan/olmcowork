import { Bot, User } from "lucide-react";
import { Markdown } from "./Markdown";
import { ToolCallCard, ToolCallRecord } from "./ToolCallCard";
import { ThinkingBlock, splitThinking } from "./ThinkingBlock";
import { cn } from "@/lib/utils";

interface Props {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  attachments?: { name: string; dataUrl: string }[] | null;
  toolCalls?: ToolCallRecord[] | null;
  streaming?: boolean;
}

export function MessageBubble({ role, content, attachments, toolCalls, streaming }: Props) {
  if (role === "system" || role === "tool") return null;
  const isUser = role === "user";

  const segments = !isUser ? splitThinking(content || "") : [];

  return (
    <div className={cn("flex gap-3 py-4", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "h-8 w-8 rounded-xl flex items-center justify-center shrink-0",
          isUser
            ? "bg-secondary text-secondary-foreground"
            : "bg-[image:var(--gradient-primary)] text-primary-foreground",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={cn("max-w-[80%] space-y-2 min-w-0", isUser && "items-end flex flex-col")}>
        {attachments && attachments.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {attachments.map((a, i) => (
              <img
                key={i}
                src={a.dataUrl}
                alt={a.name}
                className="h-32 w-32 object-cover rounded-xl border border-border"
              />
            ))}
          </div>
        )}
        {toolCalls && toolCalls.length > 0 && (
          <div className="w-full min-w-[300px]">
            {toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} call={tc} />
            ))}
          </div>
        )}
        {(content || streaming || (!toolCalls?.length && !attachments?.length)) && (
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border shadow-[var(--shadow-soft)]",
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
            ) : segments.length > 0 ? (
              <>
                {segments.map((seg, i) =>
                  seg.kind === "think" ? (
                    <ThinkingBlock key={i} content={seg.content} />
                  ) : (
                    <Markdown key={i} content={seg.content} />
                  ),
                )}
                {streaming && !content && <span className="text-muted-foreground">…</span>}
                {streaming && (
                  <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary animate-pulse rounded-sm align-middle" />
                )}
              </>
            ) : (
              <>
                <Markdown content={content || (streaming ? "…" : "")} />
                {streaming && (
                  <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary animate-pulse rounded-sm align-middle" />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
