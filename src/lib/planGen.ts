// Plan generator — asks the active LLM to break a Control-mode prompt into a
// 3-7 step checklist that the user can approve, edit, or skip before the AI
// starts touching the machine.
//
// Heuristic: only generate when the prompt looks "complex" — long enough or
// containing multi-step keywords. Simple commands ("screenshot", "click submit")
// skip planning entirely.

import { chatOnce } from "./ollamaTools";
import { streamChat } from "./ollama";
import { chatOnceOpenAI, streamOpenAI, OpenAIMessage } from "./openai";

export interface PlanStep {
  id: string;
  text: string;
  done?: boolean;
  skipped?: boolean;
}

const MULTI_STEP_KEYWORDS = [
  // English
  "then", "after", "next", "finally", "and then", "first", "second",
  "step", "steps", "before", "open and", "create and",
  // Vietnamese
  "sau đó", "tiếp theo", "rồi", "và rồi", "cuối cùng",
  "đầu tiên", "thứ hai", "trước khi", "bước",
];

/** True if the prompt looks complex enough to be worth planning. */
export function shouldGeneratePlan(prompt: string): boolean {
  const p = prompt.trim();
  if (p.length >= 80) return true;
  const lower = p.toLowerCase();
  return MULTI_STEP_KEYWORDS.some((k) => lower.includes(k));
}

const PLAN_SYSTEM = `You are a planning assistant for a computer-use AI agent.
The user has given a goal that requires controlling their computer (mouse, keyboard, files, shell).
Break the goal into 3 to 7 short, concrete, ordered steps that the agent will execute.

Rules:
- Each step ≤ 12 words, action-oriented (verb first).
- Be specific about apps/files/URLs when the user mentioned them.
- Do NOT include the goal restatement, preamble, or numbering — just the steps.
- Output ONLY the steps, one per line, prefixed with "- ".
- No markdown, no explanations, no trailing summary.`;

function parseSteps(raw: string): PlanStep[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((l) => l.length > 0 && l.length < 200);
  // Cap at 7 steps to keep the card compact.
  return lines.slice(0, 7).map((text, i) => ({
    id: `s${i}-${Date.now().toString(36)}`,
    text,
  }));
}

export interface GenerateOpts {
  provider: "ollama" | "openai";
  ollamaUrl: string;
  ollamaModel: string;
  openaiModel: string;
  signal?: AbortSignal;
}

export async function generatePlan(prompt: string, opts: GenerateOpts): Promise<PlanStep[]> {
  const userMsg = `Goal: ${prompt.trim()}\n\nGenerate the step list now.`;

  if (opts.provider === "openai") {
    const messages: OpenAIMessage[] = [
      { role: "system", content: PLAN_SYSTEM },
      { role: "user", content: userMsg },
    ];
    const res = await chatOnceOpenAI(opts.openaiModel, messages, undefined, opts.signal);
    return parseSteps(res.content);
  }

  // Ollama
  const res = await chatOnce(
    opts.ollamaUrl,
    opts.ollamaModel,
    [
      { role: "system", content: PLAN_SYSTEM },
      { role: "user", content: userMsg },
    ],
    undefined,
    opts.signal,
  );
  return parseSteps(res.content);
}
