import { ExternalLink, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UrlMeta {
  url: string;
  title?: string;
  description?: string;
  favicon?: string;
  image?: string | null;
  loading?: boolean;
  error?: string;
}

interface Props {
  meta: UrlMeta;
  onRemove?: () => void;
  compact?: boolean;
}

export function UrlPreviewChip({ meta, onRemove, compact }: Props) {
  return (
    <a
      href={meta.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group inline-flex items-center gap-2 max-w-full rounded-lg border border-border bg-card px-2 py-1.5 hover:bg-muted/40 transition",
        compact && "text-xs",
      )}
      title={meta.url}
    >
      {meta.loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-muted-foreground" />
      ) : meta.favicon ? (
        <img
          src={meta.favicon}
          alt=""
          className="h-4 w-4 rounded shrink-0"
          onError={(e) => ((e.currentTarget.style.display = "none"))}
        />
      ) : (
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="flex flex-col min-w-0 leading-tight">
        <span className="text-xs font-medium truncate text-foreground max-w-[28ch]">
          {meta.title ?? meta.url}
        </span>
        {meta.description && !compact && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[36ch]">
            {meta.description}
          </span>
        )}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onRemove();
          }}
          className="ml-1 h-4 w-4 rounded-full bg-muted text-muted-foreground hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center shrink-0"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </a>
  );
}
