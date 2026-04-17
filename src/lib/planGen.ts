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

export interface StreamPlanOpts extends GenerateOpts {
  /** Called every time the streaming buffer parses into a (possibly growing) step list. */
  onSteps: (steps: PlanStep[]) => void;
}

/**
 * Streaming variant: emits partial step lists as tokens arrive so the UI can
 * show steps appearing one by one. Resolves with the final list. Pass a signal
 * to allow the user to cancel mid-stream (e.g. "Bắt đầu sớm").
 */
export async function streamPlan(prompt: string, opts: StreamPlanOpts): Promise<PlanStep[]> {
  const userMsg = `Goal: ${prompt.trim()}\n\nGenerate the step list now.`;
  let buffer = "";
  let lastEmittedCount = -1;

  const emit = (final = false) => {
    const idx = buffer.lastIndexOf("\n");
    const parsable = final ? buffer : idx >= 0 ? buffer.slice(0, idx) : "";
    if (!parsable && !final) return;
    const steps = parseSteps(parsable);
    if (steps.length !== lastEmittedCount) {
      lastEmittedCount = steps.length;
      opts.onSteps(steps);
    }
  };

  return new Promise<PlanStep[]>((resolve, reject) => {
    const onToken = (chunk: string) => {
      buffer += chunk;
      emit(false);
    };
    const onDone = () => {
      emit(true);
      resolve(parseSteps(buffer));
    };
    const onError = (err: Error) => {
      // AbortError → resolve with whatever we got so caller can keep partial steps.
      if (err?.name === "AbortError") {
        emit(true);
        resolve(parseSteps(buffer));
        return;
      }
      reject(err);
    };

    if (opts.provider === "openai") {
      const messages: OpenAIMessage[] = [
        { role: "system", content: PLAN_SYSTEM },
        { role: "user", content: userMsg },
      ];
      streamOpenAI({ model: opts.openaiModel, messages, signal: opts.signal, onToken, onDone, onError });
    } else {
      streamChat({
        baseUrl: opts.ollamaUrl,
        model: opts.ollamaModel,
        messages: [
          { role: "system", content: PLAN_SYSTEM },
          { role: "user", content: userMsg },
        ],
        signal: opts.signal,
        onToken,
        onDone,
        onError,
      });
    }
  });
}
