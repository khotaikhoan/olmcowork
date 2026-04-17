/**
 * Heuristic detection of vision-capable Ollama models.
 * Used to decide whether to forward image attachments in chat history.
 */
const VISION_PATTERNS = [
  /llava/i,
  /vision/i,
  /llama-?3\.2-?vision/i,
  /llama4/i,
  /qwen2?.?5?-?vl/i,
  /minicpm-?v/i,
  /bakllava/i,
  /moondream/i,
  /gemma3/i, // gemma3 multimodal variants
  /pixtral/i,
];

export function modelSupportsVision(modelName: string | null | undefined): boolean {
  if (!modelName) return false;
  return VISION_PATTERNS.some((re) => re.test(modelName));
}
