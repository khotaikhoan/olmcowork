/**
 * Multi-agent presets selectable from the TopBar.
 * Each agent is a fixed (name, system prompt, suggested model) bundle —
 * no auto hand-off; user picks the active agent for the current turn.
 *
 * "default" means: do not override the conversation's own system prompt.
 */
import { Bot, FlaskConical, Code2, ShieldCheck, type LucideIcon } from "lucide-react";

export interface Agent {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** When non-empty, replaces the user's base system prompt for this turn. */
  systemPrompt: string;
  /** Substring to prefer when picking an Ollama model. */
  preferOllama?: string;
  /** Cloud model preference (OpenAI/Gemini via gateway). */
  preferOpenAI?: string;
}

export const AGENTS: Agent[] = [
  {
    id: "default",
    name: "Mặc định",
    description: "Dùng system prompt của hội thoại",
    icon: Bot,
    systemPrompt: "",
  },
  {
    id: "researcher",
    name: "Researcher",
    description: "Tổng hợp, phân tích, trích nguồn",
    icon: FlaskConical,
    systemPrompt:
      "Bạn là Researcher — chuyên gia nghiên cứu khắt khe. Tổng hợp thông tin có cấu trúc (heading, bullet), so sánh quan điểm, trích nguồn rõ ràng khi có. Luôn nêu giả định và mức độ chắc chắn. Trả lời bằng tiếng Việt.",
    preferOpenAI: "gpt-5",
  },
  {
    id: "coder",
    name: "Coder",
    description: "Viết & sửa code, đọc file trước",
    icon: Code2,
    systemPrompt:
      "Bạn là Coder — kỹ sư phần mềm cấp cao. Trước khi sửa luôn đọc file. Viết code tối thiểu, đúng chuẩn, có giải thích ngắn. Đề xuất test khi có thể. Tiếng Việt cho prose, code và identifiers giữ tiếng Anh.",
    preferOllama: "qwen2.5",
    preferOpenAI: "gpt-5.2",
  },
  {
    id: "reviewer",
    name: "Reviewer",
    description: "Soi lỗi, edge case, security",
    icon: ShieldCheck,
    systemPrompt:
      "Bạn là Reviewer — code reviewer khó tính. Tập trung vào: bug logic, edge case, lỗi bảo mật, race condition, accessibility, performance. Không khen vô nghĩa. Phản hồi bằng tiếng Việt theo format: 🐛 Bug / ⚠️ Risk / 💡 Suggest.",
    preferOpenAI: "gpt-5",
  },
];

export const AGENTS_BY_ID: Record<string, Agent> = Object.fromEntries(
  AGENTS.map((a) => [a.id, a]),
);

export function getAgent(id: string | null | undefined): Agent {
  return (id && AGENTS_BY_ID[id]) || AGENTS[0];
}
