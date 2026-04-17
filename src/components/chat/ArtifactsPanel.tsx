import { useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Copy, Download, Eye, FileCode, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Artifact, buildPreviewHtml, canPreview } from "@/lib/artifacts";
import { cn } from "@/lib/utils";

interface Props {
  artifacts: Artifact[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function ArtifactsPanel({ artifacts, activeId, onSelect, onClose }: Props) {
  const active = useMemo(
    () => artifacts.find((a) => a.id === activeId) ?? artifacts[artifacts.length - 1] ?? null,
    [artifacts, activeId],
  );
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [copied, setCopied] = useState(false);

  if (!active) return null;

  const idx = artifacts.findIndex((a) => a.id === active.id);
  const previewable = canPreview(active);
  const previewHtml = previewable ? buildPreviewHtml(active) : "";

  const copy = () => {
    navigator.clipboard.writeText(active.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const ext =
      active.kind === "html" ? "html" :
      active.kind === "svg" ? "svg" :
      active.kind === "react" ? (active.language === "jsx" ? "jsx" : "tsx") :
      active.kind === "markdown" ? "md" :
      active.language || "txt";
    const blob = new Blob([active.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${active.title.replace(/\s+/g, "-").toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <aside className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <FileCode className="h-4 w-4 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium font-serif truncate">{active.title}</div>
          <div className="text-xs text-muted-foreground truncate">{active.language || active.kind}</div>
        </div>
        {artifacts.length > 1 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={idx <= 0}
              onClick={() => onSelect(artifacts[idx - 1].id)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>{idx + 1}/{artifacts.length}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={idx >= artifacts.length - 1}
              onClick={() => onSelect(artifacts[idx + 1].id)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copy} title="Copy">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={download} title="Download">
          <Download className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} title="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col min-h-0">
        <div className="px-3 pt-2 shrink-0">
          <TabsList className="h-9">
            <TabsTrigger value="preview" disabled={!previewable} className="gap-1.5">
              <Eye className="h-3.5 w-3.5" /> Preview
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-1.5">
              <FileCode className="h-3.5 w-3.5" /> Code
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="preview" className="flex-1 m-0 mt-2 min-h-0">
          {previewable ? (
            <iframe
              key={active.id}
              title={active.title}
              srcDoc={previewHtml}
              sandbox="allow-scripts"
              className="w-full h-full bg-white border-0"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Không có live preview cho loại này. Xem tab Code.
            </div>
          )}
        </TabsContent>

        <TabsContent value="code" className="flex-1 m-0 mt-2 min-h-0">
          <ScrollArea className="h-full">
            <SyntaxHighlighter
              language={active.language || "text"}
              style={oneLight as any}
              customStyle={{
                margin: 0,
                padding: "1rem",
                background: "hsl(var(--card))",
                fontSize: "0.85rem",
                minHeight: "100%",
              }}
              wrapLongLines
            >
              {active.content}
            </SyntaxHighlighter>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
  );
}

interface ChipProps {
  artifact: Artifact;
  onOpen: () => void;
  active?: boolean;
}

export function ArtifactChip({ artifact, onOpen, active }: ChipProps) {
  return (
    <button
      onClick={onOpen}
      className={cn(
        "group flex items-center gap-2 w-full text-left rounded-xl border border-border bg-background hover:bg-muted/50 transition px-3 py-2 my-2 shadow-[var(--shadow-soft)]",
        active && "ring-2 ring-primary/40 border-primary/40",
      )}
    >
      <div className="h-8 w-8 rounded-lg bg-[image:var(--gradient-primary)] text-primary-foreground flex items-center justify-center shrink-0">
        <FileCode className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{artifact.title}</div>
        <div className="text-xs text-muted-foreground truncate">
          {artifact.kind} · {artifact.content.split("\n").length} dòng · click để mở
        </div>
      </div>
    </button>
  );
}
