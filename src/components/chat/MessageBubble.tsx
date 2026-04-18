import { useState } from "react";
import { User, Check, X, RotateCw, Loader2, ArrowDownToLine, AlertCircle } from "lucide-react";
import { OculoLogo } from "@/components/OculoLogo";
import { Markdown } from "./Markdown";
import { ToolCallRecord } from "./ToolCallCard";
import { InlineToolCall } from "./InlineToolCall";
import { ThinkingBlock, splitThinking } from "./ThinkingBlock";
import { ArtifactChip } from "./ArtifactsPanel";
import { extractArtifacts } from "@/lib/artifacts";
import { MessageActions } from "./MessageActions";
import { highlightMatches } from "./ChatSearch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface Props {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  attachments?: { name: string; dataUrl: string }[] | null;
  toolCalls?: ToolCallRecord[] | null;
  streaming?: boolean;
  messageId?: string;
  searchQuery?: string;
  onArtifactOpen?: (id: string) => void;
  onRegenerate?: () => void;
  onEditSubmit?: (newContent: string) => void;
  onBranch?: () => void;
  onReannotate?: () => void;
  onRetryTool?: (callId: string) => void;
  onRetryAllFailed?: () => void;
  bulkRetryProgress?: { current: number; total: number } | null;
  /** Optional — when streaming a thinking segment, allow user to skip reasoning. */
  onSkipThinking?: () => void;
  /** Optional — show "Continue generating" button when reply looks truncated. */
  onContinue?: () => void;
  continueReason?: string;
  /** Optimistic state — bubble is in-flight (renders dimmed). */
  pending?: boolean;
  /** Optimistic state — insert failed; renders an inline Retry control. */
  failed?: boolean;
  /** Called when the user clicks "Thử lại" on a failed user message. */
  onRetrySend?: () => void;
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
  searchQuery,
  onArtifactOpen,
  onRegenerate,
  onEditSubmit,
  onBranch,
  onReannotate,
  onRetryTool,
  onRetryAllFailed,
  bulkRetryProgress,
  onSkipThinking,
  onContinue,
  continueReason,
  pending,
  failed,
  onRetrySend,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);

  if (role === "system" || role === "tool") return null;
  const isUser = role === "user";

  const segments = !isUser ? splitThinking(content || "") : [];
  const artifacts = !isUser && messageId ? extractArtifacts(messageId, content || "") : [];

  const hasMatch =
    !!searchQuery && content.toLowerCase().includes(searchQuery.toLowerCase());

  return (
    <div
      data-message-id={messageId}
      data-has-match={hasMatch ? "true" : undefined}
      className={cn(
        "group flex gap-3 py-4 animate-fade-in scroll-mt-20",
        isUser && "flex-row-reverse",
        hasMatch && "ring-1 ring-warning/40 rounded-2xl px-2 -mx-2",
      )}
    >
      <div
        className={cn(
          "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
          isUser
            ? "bg-secondary text-secondary-foreground"
            : "bg-[image:var(--gradient-primary)] text-primary-foreground",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <OculoLogo size={18} withGradient={false} className="text-primary-foreground" />}
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
          <div className="space-y-0.5 w-full">
            {toolCalls.map((c) => (
              <InlineToolCall
                key={c.id}
                call={c}
                precedingText={!isUser ? content : undefined}
                onReannotate={onReannotate}
                onRetry={onRetryTool ? () => onRetryTool(c.id) : undefined}
              />
            ))}
          </div>
        )}
        {toolCalls && toolCalls.length > 0 && (() => {
          const failedCount = toolCalls.filter((c) => c.status === "error").length;
          const isRetrying = !!bulkRetryProgress;
          if (failedCount < 2 && !isRetrying) return null;
          return (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-2.5 space-y-2 animate-fade-in">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-destructive font-medium">
                  {isRetrying
                    ? `Đang thử lại ${bulkRetryProgress!.current}/${bulkRetryProgress!.total}…`
                    : `${failedCount} tool lỗi`}
                </span>
                {onRetryAllFailed && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-destructive/40 hover:bg-destructive/10"
                    onClick={onRetryAllFailed}
                    disabled={isRetrying}
                  >
                    {isRetrying ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RotateCw className="h-3 w-3 mr-1" />
                    )}
                    Thử lại tất cả tool lỗi
                  </Button>
                )}
              </div>
              {isRetrying && (
                <Progress
                  value={(bulkRetryProgress!.current / Math.max(1, bulkRetryProgress!.total)) * 100}
                  className="h-1.5"
                />
              )}
            </div>
          );
        })()}
        {(content || streaming || (!toolCalls?.length && !attachments?.length)) && (
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 transition-all w-full",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-elevated)]",
              pending && "opacity-70",
              failed && "ring-1 ring-destructive/60",
            )}
          >
            {editing && isUser && onEditSubmit ? (
              <div className="space-y-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={Math.min(10, Math.max(2, draft.split("\n").length))}
                  className="bg-background text-foreground"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(false);
                      setDraft(content);
                    }}
                  >
                    <X className="h-3 w-3 mr-1" /> Huỷ
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      onEditSubmit(draft.trim());
                      setEditing(false);
                    }}
                    disabled={!draft.trim() || draft.trim() === content.trim()}
                  >
                    <Check className="h-3 w-3 mr-1" /> Lưu & gửi lại
                  </Button>
                </div>
              </div>
            ) : isUser ? (
              <p
                className="whitespace-pre-wrap leading-relaxed"
                dangerouslySetInnerHTML={{
                  __html: searchQuery
                    ? highlightMatches(content, searchQuery)
                    : content,
                }}
              />
            ) : segments.length > 0 ? (
              <>
                {segments.map((seg, i) =>
                  seg.kind === "think" ? (
                    <ThinkingBlock
                      key={i}
                      content={seg.content}
                      streaming={!!streaming && !!seg.open}
                      onSkip={streaming && seg.open ? onSkipThinking : undefined}
                    />
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
        {!isUser && !streaming && onContinue && (
          <button
            onClick={onContinue}
            className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 hover:border-primary/50 transition-colors animate-fade-in"
            title={continueReason ? `Có vẻ bị cắt: ${continueReason}` : "Tiếp tục câu trả lời từ chỗ này"}
          >
            <ArrowDownToLine className="h-3 w-3" />
            Tiếp tục từ đây
          </button>
        )}
        {!streaming && content && !editing && (
          <MessageActions
            content={content}
            onRegenerate={!isUser ? onRegenerate : undefined}
            onEdit={isUser && onEditSubmit ? () => setEditing(true) : undefined}
            onBranch={onBranch}
          />
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
