/**
 * Phase 5 — Multi-agent orchestration.
 *
 * A lightweight sub-agent runner: the parent agent calls the `spawn_agent`
 * tool to fork an isolated worker that has its own conversation context and
 * a (subset of) tools. Sub-agents run concurrently up to MAX_CONCURRENT and
 * the rest queue. Nested spawning is allowed up to MAX_DEPTH.
 *
 * The store is observable so the Agents tab in ArtifactsPanel can render
 * a live tree view.
 */

import { TOOLS_BY_NAME, isActionAllowedInMode, type ConversationMode } from "./tools";
import { executeTool } from "./bridge";
import { chatOnce, type OllamaChatMessage, type OllamaTool } from "./ollamaTools";
import { chatOnceOpenAI, type OpenAIMessage, type OpenAITool } from "./openai";

export const MAX_CONCURRENT = 3;
export const MAX_DEPTH = 2;
export const SUB_AGENT_MAX_STEPS = 10;

export type AgentStatus = "queued" | "running" | "done" | "failed" | "cancelled";

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
    ? req.tools.filter((t) => parentSet.has(t) || t === "spawn_agent")
    : [...ctx.parentTools];
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

async function runAgent(node: AgentNode): Promise<void> {
  if (!ctx) throw new Error("Orchestrator not configured");
  node.status = "running";
  node.startedAt = Date.now();
  node._abort = new AbortController();
  emit();

  const systemPrompt =
    `You are a focused sub-agent named "${node.name}".\n` +
    `Goal: ${node.goal}\n` +
    `Available tools: ${node.tools.join(", ") || "(none)"}.\n` +
    `Work autonomously, do not ask the user questions. When the goal is met, ` +
    `respond with a concise final answer and STOP calling tools.`;

  const toolDefs = node.tools
    .map((name) => TOOLS_BY_NAME[name])
    .filter(Boolean);

  try {
    const finalText = ctx.provider === "openai"
      ? await runLoopOpenAI(node, systemPrompt, toolDefs)
      : await runLoopOllama(node, systemPrompt, toolDefs);

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

async function runLoopOllama(
  node: AgentNode,
  systemPrompt: string,
  toolDefs: { name: string; description: string; parameters: any }[],
): Promise<string> {
  if (!ctx) throw new Error("no ctx");
  const tools: OllamaTool[] = toolDefs.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  let working: OllamaChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: node.goal },
  ];

  for (let step = 0; step < SUB_AGENT_MAX_STEPS; step++) {
    if (node._abort?.signal.aborted) throw new DOMException("Aborted", "AbortError");
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
  systemPrompt: string,
  toolDefs: { name: string; description: string; parameters: any }[],
): Promise<string> {
  if (!ctx) throw new Error("no ctx");
  const tools: OpenAITool[] = toolDefs.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  let working: OpenAIMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: node.goal },
  ];

  for (let step = 0; step < SUB_AGENT_MAX_STEPS; step++) {
    if (node._abort?.signal.aborted) throw new DOMException("Aborted", "AbortError");
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
