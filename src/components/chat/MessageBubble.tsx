import { Bot, User } from "lucide-react";
import { Markdown } from "./Markdown";
import { ToolCallCard, ToolCallRecord } from "./ToolCallCard";
import { ThinkingBlock, splitThinking } from "./ThinkingBlock";
import { ArtifactChip } from "./ArtifactsPanel";
import { extractArtifacts } from "@/lib/artifacts";
import { MessageActions } from "./MessageActions";
import { cn } from "@/lib/utils";

interface Props {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  attachments?: { name: string; dataUrl: string }[] | null;
  toolCalls?: ToolCallRecord[] | null;
  streaming?: boolean;
  messageId?: string;
  onArtifactOpen?: (id: string) => void;
  onRegenerate?: () => void;
}

function stripExtractedFences(content: string, _fenceCount: number): string {
  return content;
}

export function MessageBubble({
  role,
  content,
  attachments,
  toolCalls,
  streaming,
  messageId,
  onArtifactOpen,
  onRegenerate,
}: Props) {
  if (role === "system" || role === "tool") return null;
  const isUser = role === "user";

  const segments = !isUser ? splitThinking(content || "") : [];
  const artifacts = !isUser && messageId ? extractArtifacts(messageId, content || "") : [];

  return (
    <div className={cn("group flex gap-3 py-4 animate-fade-in", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
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
          <div className="w-full min-w-[300px] relative">
            {/* timeline rail */}
            {toolCalls.length > 1 && (
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
            )}
            {toolCalls.map((tc) => (
              <div key={tc.id} className="relative">
                <ToolCallCard call={tc} />
              </div>
            ))}
          </div>
        )}
        {(content || streaming || (!toolCalls?.length && !attachments?.length)) && (
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 transition-shadow",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-elevated)]",
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
                    <Markdown key={i} content={stripExtractedFences(seg.content, artifacts.length)} />
                  ),
                )}
                {streaming && !content && (
                  <div className="flex gap-1 py-1" aria-label="Đang suy nghĩ">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: "180ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: "360ms" }} />
                  </div>
                )}
                {streaming && content && <span className="stream-cursor" />}
              </>
            ) : (
              <>
                <Markdown content={stripExtractedFences(content || "", artifacts.length)} />
                {streaming && !content && (
                  <div className="flex gap-1 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: "180ms" }} />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: "360ms" }} />
                  </div>
                )}
                {streaming && content && <span className="stream-cursor" />}
              </>
            )}
          </div>
        )}
        {!isUser && !streaming && content && (
          <MessageActions content={content} onRegenerate={onRegenerate} />
        )}
        {!isUser && artifacts.length > 0 && onArtifactOpen && (
          <div className="w-full min-w-[300px]">
            {artifacts.map((a) => (
              <ArtifactChip key={a.id} artifact={a} onOpen={() => onArtifactOpen(a.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
