interface ExportMessage {
  role: string;
  content: string;
  created_at: string;
  attachments?: { name: string }[] | null;
  tool_calls?: { name: string; status: string; result?: string }[] | null;
}

export function toMarkdown(title: string, messages: ExportMessage[]): string {
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`_Exported ${new Date().toISOString()}_`);
  lines.push("");
  for (const m of messages) {
    if (m.role === "system" || m.role === "tool") continue;
    const who = m.role === "user" ? "**You**" : "**Assistant**";
    lines.push(`---`);
    lines.push(`${who} · ${new Date(m.created_at).toLocaleString()}`);
    lines.push("");
    if (m.content?.trim()) {
      lines.push(m.content.trim());
      lines.push("");
    }
    if (m.attachments?.length) {
      lines.push(`_Attachments: ${m.attachments.map((a) => a.name).join(", ")}_`);
      lines.push("");
    }
    if (m.tool_calls?.length) {
      lines.push("**Tool calls:**");
      for (const tc of m.tool_calls) {
        lines.push(`- \`${tc.name}\` → ${tc.status}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function toJson(title: string, messages: ExportMessage[]): string {
  return JSON.stringify({ title, exported_at: new Date().toISOString(), messages }, null, 2);
}

export function downloadFile(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_\u00C0-\u1EF9 ]+/gi, "_").trim().slice(0, 80) || "chat";
}
