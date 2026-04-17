// USD per 1M tokens. Source: public pricing pages, snapshot 2025-04. Update as needed.
// Ollama (local) = free.
export interface ModelPrice {
  input: number;  // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

export const PRICING: Record<string, ModelPrice> = {
  // OpenAI
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5.2": { input: 1.5, output: 12 },
  // Lovable AI Gateway
  "google/gemini-2.5-flash-lite": { input: 0.05, output: 0.2 },
  "google/gemini-2.5-flash": { input: 0.075, output: 0.3 },
  "google/gemini-2.5-pro": { input: 1.25, output: 10 },
  "google/gemini-3-flash-preview": { input: 0.075, output: 0.3 },
  "google/gemini-3.1-flash-image-preview": { input: 0.075, output: 0.3 },
  "google/gemini-3.1-pro-preview": { input: 1.25, output: 10 },
  "google/gemini-3-pro-image-preview": { input: 1.25, output: 10 },
};

export function isLocalModel(model: string): boolean {
  if (!model) return true;
  return !PRICING[model] && !model.includes("/") && !model.startsWith("gpt-");
}

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.001) return "<$0.001";
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
