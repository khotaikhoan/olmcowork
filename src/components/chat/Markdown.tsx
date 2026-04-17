import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { CodeRunner } from "./CodeRunner";

// Map common short names to react-syntax-highlighter / Prism language keys.
const LANG_ALIAS: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  py: "python",
  rb: "ruby",
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  yml: "yaml",
  md: "markdown",
  "c++": "cpp",
  cs: "csharp",
  "objective-c": "objectivec",
  objc: "objectivec",
  ps: "powershell",
  ps1: "powershell",
  dockerfile: "docker",
  vue: "markup",
  html: "markup",
  xml: "markup",
  svg: "markup",
  conf: "ini",
  env: "ini",
  proto: "protobuf",
  rs: "rust",
  kt: "kotlin",
  pl: "perl",
};

function normalizeLang(lang: string): string {
  const l = (lang || "text").toLowerCase().trim();
  return LANG_ALIAS[l] ?? l;
}

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const normalized = normalizeLang(language);
  return (
    <div className="relative group my-3 rounded-lg overflow-hidden border border-border">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted text-xs text-muted-foreground">
        <span className="font-mono">{language || "text"}</span>
        <div className="flex items-center gap-1">
          <CodeRunner code={value} language={language || "text"} />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={copy}
            title={copied ? "Đã sao chép" : "Sao chép"}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      </div>
      <SyntaxHighlighter
        language={normalized}
        style={oneDark as any}
        showLineNumbers={value.split("\n").length > 6}
        wrapLongLines
        customStyle={{
          margin: 0,
          background: "hsl(var(--card))",
          fontSize: "0.85rem",
          padding: "0.75rem 1rem",
        }}
        lineNumberStyle={{
          color: "hsl(var(--muted-foreground) / 0.5)",
          fontSize: "0.75rem",
          paddingRight: "0.75rem",
          minWidth: "2.5em",
        }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="prose-chat max-w-none text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const value = String(children).replace(/\n$/, "");
            if (!inline && match) {
              return <CodeBlock language={match[1]} value={value} />;
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
