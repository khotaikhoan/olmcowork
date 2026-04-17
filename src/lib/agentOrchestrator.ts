/**
 * Phase 5 + 6 — Multi-agent orchestration & messaging.
 *
 * Phase 5: spawn_agent forks isolated sub-agents (concurrency 3, depth ≤ 2),
 *          each with own context + tool subset.
 * Phase 6: send_to_agent / report_to_parent — bidirectional messaging.
 *          • Parent → child: appended to child.inbox; auto-injected as a
 *            user message before child's NEXT step. Optional new_goal
 *            replaces the goal field + the system message.
 *          • Child → parent: appended to ROOT_REPORTS (or parent.reports);
 *            parent loop drains reports each step and injects them.
 *          Permission: only direct parent ↔ direct child.
 */

import { TOOLS_BY_NAME, isActionAllowedInMode, type ConversationMode } from "./tools";
import { executeTool } from "./bridge";
import { chatOnce, type OllamaChatMessage, type OllamaTool } from "./ollamaTools";
import { chatOnceOpenAI, type OpenAIMessage, type OpenAITool } from "./openai";

export const MAX_CONCURRENT = 3;
export const MAX_DEPTH = 2;
export const SUB_AGENT_MAX_STEPS = 10;

/** Sentinel parent id used when a top-level (root) sub-agent reports back —
 *  the user's main ChatView agent is the parent but has no AgentNode. */
export const ROOT_PARENT_ID = "__root__";

export type AgentStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface AgentMessage {
  id: string;
  /** Sender agent id, or ROOT_PARENT_ID when sent from the user's main agent. */
  fromId: string;
  fromName: string;
  text: string;
  /** Set when the sender wanted to replace the recipient's goal. */
  newGoal?: string;
  /** "inbox" = parent→child instructions; "report" = child→parent progress. */
  kind: "inbox" | "report";
  ts: number;
  /** Marked true once the recipient's loop has consumed it. */
  consumed: boolean;
}

export interface AgentNode {
  id: string;
  parentId: string | null;
  depth: number;
  name: string;
  goal: string;
  tools: string[];
  model: string;
  status: AgentStatus;
  output: string;
  /** running step count (1-based) */
  step: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  /** child agent ids spawned by this agent */
  childIds: string[];
  /** Messages received from parent (auto-injected before next step). */
  inbox: AgentMessage[];
  /** Reports received from children. */
  reports: AgentMessage[];
  /** abort handle */
  _abort?: AbortController;
}

export interface SpawnRequest {
  name: string;
  goal: string;
  tools?: string[];
  model?: string;
  parentId?: string | null;
  depth?: number;
}

interface OrchestratorContext {
  provider: "ollama" | "openai";
  ollamaUrl: string;
  defaultOllamaModel: string;
  openaiModel: string;
  mode: ConversationMode;
  /** parent's full tool list — sub-agent can inherit from this */
  parentTools: string[];
}

let ctx: OrchestratorContext | null = null;
const nodes = new Map<string, AgentNode>();
const queue: string[] = [];
let runningCount = 0;
const listeners = new Set<() => void>();

/** Reports addressed to the user's main (root) agent — drained by ChatView each step. */
const rootReports: AgentMessage[] = [];

export function configureOrchestrator(next: OrchestratorContext): void {
  ctx = next;
}

export function subscribeAgents(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit(): void {
  for (const l of listeners) l();
}

export function listAgents(): AgentNode[] {
  return Array.from(nodes.values()).sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
}

export function getAgentNode(id: string): AgentNode | undefined {
  return nodes.get(id);
}

export function clearFinishedAgents(): void {
  for (const [id, n] of nodes.entries()) {
    if (n.status === "done" || n.status === "failed" || n.status === "cancelled") {
      nodes.delete(id);
    }
  }
  // Also drop root reports from agents that no longer exist.
  for (let i = rootReports.length - 1; i >= 0; i--) {
    if (!nodes.has(rootReports[i].fromId)) rootReports.splice(i, 1);
  }
  emit();
}

export function cancelAgent(id: string): void {
  const n = nodes.get(id);
  if (!n) return;
  if (n.status === "queued") {
    n.status = "cancelled";
    const i = queue.indexOf(id);
    if (i >= 0) queue.splice(i, 1);
  } else if (n.status === "running") {
    n._abort?.abort();
    n.status = "cancelled";
    n.finishedAt = Date.now();
    runningCount = Math.max(0, runningCount - 1);
    pump();
  }
  emit();
}

export function cancelAllAgents(): void {
  for (const n of nodes.values()) {
    if (n.status === "running") n._abort?.abort();
    if (n.status === "running" || n.status === "queued") {
      n.status = "cancelled";
      n.finishedAt = Date.now();
    }
  }
  queue.length = 0;
  runningCount = 0;
  emit();
}

// ────────────────── Phase 6: messaging APIs ──────────────────

/**
 * Permission check: only the direct parent or a direct child of `targetId`
 * (identified by `senderId`) may send to it. ROOT_PARENT_ID is the user's
 * main agent — it may message any of its direct children (parentId === null).
 */
function canMessage(senderId: string, targetId: string): { ok: boolean; reason?: string } {
  const target = nodes.get(targetId);
  if (!target) return { ok: false, reason: `Unknown agent: ${targetId}` };

  if (senderId === ROOT_PARENT_ID) {
    if (target.parentId === null) return { ok: true };
    return { ok: false, reason: "Root may only message its direct (top-level) sub-agents." };
  }
  const sender = nodes.get(senderId);
  if (!sender) return { ok: false, reason: `Unknown sender: ${senderId}` };
  if (target.parentId === sender.id) return { ok: true }; // parent → child
  if (sender.parentId === target.id) return { ok: true }; // child → parent
  return { ok: false, reason: "Only direct parent ↔ direct child messaging is allowed." };
}

function senderName(senderId: string): string {
  if (senderId === ROOT_PARENT_ID) return "user-main-agent";
  return nodes.get(senderId)?.name ?? "unknown";
}

/**
 * Parent → child. The text is queued in the recipient's inbox and will be
 * injected as a user message right before its next step. If `newGoal` is
 * provided, also overwrites the recipient's goal field.
 */
export function sendToAgent(
  senderId: string,
  targetId: string,
  text: string,
  newGoal?: string,
): { ok: boolean; output: string } {
  const perm = canMessage(senderId, targetId);
  if (!perm.ok) return { ok: false, output: perm.reason ?? "denied" };
  const target = nodes.get(targetId)!;
  if (target.status !== "running" && target.status !== "queued") {
    return { ok: false, output: `Cannot message agent in status=${target.status}.` };
  }
  const msg: AgentMessage = {
    id: crypto.randomUUID(),
    fromId: senderId,
    fromName: senderName(senderId),
    text,
    newGoal: newGoal?.trim() || undefined,
    kind: "inbox",
    ts: Date.now(),
    consumed: false,
  };
  target.inbox.push(msg);
  if (msg.newGoal) target.goal = msg.newGoal;
  emit();
  return {
    ok: true,
    output: `Delivered to ${target.name} (${targetId.slice(0, 8)})${
      msg.newGoal ? " · goal updated" : ""
    }. Will be injected before next step.`,
  };
}

/**
 * Child → parent. Reports are stored on the parent (or in the root inbox if
 * parent is the user's main agent). The parent loop drains them each step.
 */
export function reportToParent(
  senderId: string,
  text: string,
): { ok: boolean; output: string } {
  const sender = nodes.get(senderId);
  if (!sender) return { ok: false, output: `Unknown sender: ${senderId}` };
  const targetId = sender.parentId ?? ROOT_PARENT_ID;
  // Permission is implicit (child → its own parent only).
  const msg: AgentMessage = {
    id: crypto.randomUUID(),
    fromId: senderId,
    fromName: sender.name,
    text,
    kind: "report",
    ts: Date.now(),
    consumed: false,
  };
  if (targetId === ROOT_PARENT_ID) {
    rootReports.push(msg);
  } else {
    nodes.get(targetId)?.reports.push(msg);
  }
  emit();
  return { ok: true, output: `Report queued to ${targetId === ROOT_PARENT_ID ? "main agent" : nodes.get(targetId)?.name ?? "parent"}.` };
}

/**
 * Drain pending reports addressed to the root (user's main) agent.
 * Returns the messages and marks them consumed so they don't repeat.
 * Called by ChatView's tool loop before each model step.
 */
export function drainRootReports(): AgentMessage[] {
  const out = rootReports.filter((m) => !m.consumed);
  for (const m of out) m.consumed = true;
  return out;
}

/** Direct-child agent ids of the root agent (used for permission listing). */
export function listRootChildren(): AgentNode[] {
  return Array.from(nodes.values()).filter((n) => n.parentId === null);
}

// ─────────────────────────────────────────────────────────────

/**
 * Public spawn API — used by the `spawn_agent` tool.
 * Returns a Promise that resolves with the sub-agent's final answer.
 */
export async function spawnAgent(req: SpawnRequest): Promise<{ id: string; output: string; ok: boolean }> {
  if (!ctx) throw new Error("Orchestrator not configured");

  const depth = req.depth ?? 0;
  if (depth > MAX_DEPTH) {
    return { id: "", output: `Spawn rejected: max depth ${MAX_DEPTH} exceeded.`, ok: false };
  }

  // Tool subset: requested ∩ parent's allowed list. Always strip nested-spawn at max depth.
  const parentSet = new Set(ctx.parentTools);
  let allowed = (req.tools && req.tools.length > 0)
    ? req.tools.filter((t) => parentSet.has(t) || t === "spawn_agent" || t === "report_to_parent")
    : [...ctx.parentTools];
  // Sub-agents always get report_to_parent (parent doesn't need it).
  if (!allowed.includes("report_to_parent")) allowed.push("report_to_parent");
  if (depth >= MAX_DEPTH) allowed = allowed.filter((t) => t !== "spawn_agent");

  const id = crypto.randomUUID();
  const node: AgentNode = {
    id,
    parentId: req.parentId ?? null,
    depth,
    name: req.name || "Sub-agent",
    goal: req.goal,
    tools: allowed,
    model: req.model || (ctx.provider === "openai" ? ctx.openaiModel : ctx.defaultOllamaModel),
    status: "queued",
    output: "",
    step: 0,
    childIds: [],
    inbox: [],
    reports: [],
  };
  nodes.set(id, node);
  if (req.parentId) {
    const parent = nodes.get(req.parentId);
    if (parent) parent.childIds.push(id);
  }
  queue.push(id);
  emit();
  pump();

  // Wait for completion
  return new Promise((resolve) => {
    const unsub = subscribeAgents(() => {
      const n = nodes.get(id);
      if (!n) {
        unsub();
        resolve({ id, output: "Agent disappeared", ok: false });
        return;
      }
      if (n.status === "done" || n.status === "failed" || n.status === "cancelled") {
        unsub();
        resolve({
          id,
          output: n.output || n.error || "(empty)",
          ok: n.status === "done",
        });
      }
    });
  });
}

function pump(): void {
  while (runningCount < MAX_CONCURRENT && queue.length > 0) {
    const id = queue.shift()!;
    const node = nodes.get(id);
    if (!node || node.status !== "queued") continue;
    runningCount++;
    runAgent(node).catch((e) => {
      node.status = "failed";
      node.error = String(e?.message ?? e);
      node.finishedAt = Date.now();
      runningCount = Math.max(0, runningCount - 1);
      emit();
      pump();
    });
  }
}

function buildSystemPrompt(node: AgentNode): string {
  return (
    `You are a focused sub-agent named "${node.name}" (id=${node.id.slice(0, 8)}).\n` +
    `Goal: ${node.goal}\n` +
    `Available tools: ${node.tools.join(", ") || "(none)"}.\n` +
    `Work autonomously, do not ask the user questions. ` +
    `If you have important progress to share with the parent, call report_to_parent(text). ` +
    `When the goal is met, respond with a concise final answer and STOP calling tools.`
  );
}

async function runAgent(node: AgentNode): Promise<void> {
  if (!ctx) throw new Error("Orchestrator not configured");
  node.status = "running";
  node.startedAt = Date.now();
  node._abort = new AbortController();
  emit();

  const toolDefs = node.tools
    .map((name) => TOOLS_BY_NAME[name])
    .filter(Boolean);

  try {
    const finalText = ctx.provider === "openai"
      ? await runLoopOpenAI(node, toolDefs)
      : await runLoopOllama(node, toolDefs);

    node.output = finalText;
    node.status = "done";
    node.finishedAt = Date.now();
  } catch (e: any) {
    if (e?.name === "AbortError") {
      // already marked cancelled
    } else {
      node.status = "failed";
      node.error = String(e?.message ?? e);
      node.finishedAt = Date.now();
    }
  } finally {
    runningCount = Math.max(0, runningCount - 1);
    emit();
    pump();
  }
}

/** Drain unread inbox messages and format as a user-role text to inject. */
function drainInboxText(node: AgentNode): string | null {
  const pending = node.inbox.filter((m) => !m.consumed);
  if (pending.length === 0) return null;
  for (const m of pending) m.consumed = true;
  // If the most recent message updated the goal, surface that explicitly.
  const lines = pending.map((m) => {
    const head = m.newGoal
      ? `[INSTRUCTION from ${m.fromName} · NEW GOAL set]`
      : `[INSTRUCTION from ${m.fromName}]`;
    return `${head}\n${m.text}${m.newGoal ? `\n→ Updated goal: ${m.newGoal}` : ""}`;
  });
  emit();
  return lines.join("\n\n");
}

/** Drain unread child reports for an in-tree (non-root) parent. */
function drainReportsText(node: AgentNode): string | null {
  const pending = node.reports.filter((m) => !m.consumed);
  if (pending.length === 0) return null;
  for (const m of pending) m.consumed = true;
  const lines = pending.map((m) => `[REPORT from ${m.fromName} (${m.fromId.slice(0, 8)})]\n${m.text}`);
  emit();
  return lines.join("\n\n");
}

async function runLoopOllama(
  node: AgentNode,
  toolDefs: { name: string; description: string; parameters: any }[],
): Promise<string> {
  if (!ctx) throw new Error("no ctx");
  const tools: OllamaTool[] = toolDefs.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  let working: OllamaChatMessage[] = [
    { role: "system", content: buildSystemPrompt(node) },
    { role: "user", content: node.goal },
  ];

  for (let step = 0; step < SUB_AGENT_MAX_STEPS; step++) {
    if (node._abort?.signal.aborted) throw new DOMException("Aborted", "AbortError");

    // Phase 6: drain inbox + child reports BEFORE asking the model.
    const inbox = drainInboxText(node);
    if (inbox) {
      // If goal changed, refresh the system prompt too.
      working[0] = { role: "system", content: buildSystemPrompt(node) };
      working.push({ role: "user", content: inbox });
    }
    const reports = drainReportsText(node);
    if (reports) working.push({ role: "user", content: reports });

    node.step = step + 1;
    emit();
    const resp = await chatOnce(ctx.ollamaUrl, node.model, working, tools.length ? tools : undefined, node._abort!.signal);
    if (!resp.tool_calls || resp.tool_calls.length === 0) return resp.content;

    working.push({ role: "assistant", content: resp.content || "", tool_calls: resp.tool_calls });
    for (const tc of resp.tool_calls) {
      const args = typeof tc.function.arguments === "string"
        ? safeParse(tc.function.arguments)
        : (tc.function.arguments ?? {});
      const out = await execSubAgentTool(node, tc.function.name, args);
      working.push({ role: "tool", tool_name: tc.function.name, content: out });
    }
  }
  return "(sub-agent reached max steps)";
}

async function runLoopOpenAI(
  node: AgentNode,
  toolDefs: { name: string; description: string; parameters: any }[],
): Promise<string> {
  if (!ctx) throw new Error("no ctx");
  const tools: OpenAITool[] = toolDefs.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  let working: OpenAIMessage[] = [
    { role: "system", content: buildSystemPrompt(node) },
    { role: "user", content: node.goal },
  ];

  for (let step = 0; step < SUB_AGENT_MAX_STEPS; step++) {
    if (node._abort?.signal.aborted) throw new DOMException("Aborted", "AbortError");

    const inbox = drainInboxText(node);
    if (inbox) {
      working[0] = { role: "system", content: buildSystemPrompt(node) };
      working.push({ role: "user", content: inbox });
    }
    const reports = drainReportsText(node);
    if (reports) working.push({ role: "user", content: reports });

    node.step = step + 1;
    emit();
    const resp = await chatOnceOpenAI(node.model, working, tools.length ? tools : undefined, node._abort!.signal);
    if (!resp.tool_calls || resp.tool_calls.length === 0) return resp.content;

    working.push({ role: "assistant", content: resp.content || "", tool_calls: resp.tool_calls });
    for (const tc of resp.tool_calls) {
      const args = typeof tc.function.arguments === "string"
        ? safeParse(tc.function.arguments)
        : (tc.function.arguments ?? {});
      const out = await execSubAgentTool(node, tc.function.name, args);
      working.push({ role: "tool", tool_call_id: tc.id, content: out });
    }
  }
  return "(sub-agent reached max steps)";
}

async function execSubAgentTool(
  node: AgentNode,
  name: string,
  args: Record<string, any>,
): Promise<string> {
  if (!ctx) return "no ctx";

  // Phase 6: messaging tools handled in-process (no bridge round-trip).
  if (name === "report_to_parent") {
    const r = reportToParent(node.id, String(args.text ?? ""));
    return r.output;
  }
  if (name === "send_to_agent") {
    // Sub-agent → its own children only.
    const r = sendToAgent(
      node.id,
      String(args.agent_id ?? ""),
      String(args.message ?? ""),
      args.new_goal ? String(args.new_goal) : undefined,
    );
    return r.output;
  }

  // Nested spawn → recurse via spawnAgent (depth+1).
  if (name === "spawn_agent") {
    if (node.depth >= MAX_DEPTH) {
      return `Spawn rejected: max depth ${MAX_DEPTH} reached at this branch.`;
    }
    const child = await spawnAgent({
      name: String(args.name ?? "Nested"),
      goal: String(args.goal ?? ""),
      tools: Array.isArray(args.tools) ? args.tools.map(String) : undefined,
      model: args.model ? String(args.model) : undefined,
      parentId: node.id,
      depth: node.depth + 1,
    });
    return `[child:${child.id}] ${child.ok ? "ok" : "failed"}\n${child.output}`;
  }
  // Whitelist enforcement
  if (!node.tools.includes(name)) {
    return `Tool "${name}" not in this sub-agent's allowed list.`;
  }
  const def = TOOLS_BY_NAME[name];
  if (!def) return `Unknown tool: ${name}`;
  if (!isActionAllowedInMode(ctx.mode, name, args)) {
    return `Tool "${name}" not allowed in current mode.`;
  }
  try {
    const r = await executeTool(name, args);
    return r.output ?? (r.ok ? "ok" : "failed");
  } catch (e: any) {
    return `Tool error: ${e?.message ?? e}`;
  }
}

function safeParse(s: string): Record<string, any> {
  try { return JSON.parse(s); } catch { return {}; }
}
