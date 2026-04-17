import { Code2, Search, Bot, Pencil, type LucideIcon } from "lucide-react";

export interface AgentPreset {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  systemPrompt: string;
  toolsEnabled: boolean;
  /** Suggested model substring (matches first available) */
  preferOllama?: string;
  preferOpenAI?: string;
}

export const AGENT_PRESETS: AgentPreset[] = [
  {
    id: "general",
    name: "Trợ lý chung",
    description: "Trò chuyện thông thường, không bật công cụ",
    icon: Bot,
    systemPrompt: "",
    toolsEnabled: false,
  },
  {
    id: "coding",
    name: "Coding agent",
    description: "Đọc file, chạy lệnh, sửa code",
    icon: Code2,
    systemPrompt:
      "Bạn là một kỹ sư phần mềm chuyên nghiệp. Trước khi sửa file luôn đọc nó. Viết code sạch, chạy được. Giải thích ngắn gọn bằng tiếng Việt. Không hỏi xác nhận khi chỉ đọc file/list dir.",
    toolsEnabled: true,
    preferOllama: "qwen2.5",
    preferOpenAI: "gpt-5.2",
  },
  {
    id: "research",
    name: "Research agent",
    description: "Tóm tắt, phân tích, viết",
    icon: Search,
    systemPrompt:
      "Bạn là chuyên gia nghiên cứu. Tổng hợp thông tin có cấu trúc (heading + bullet), trích nguồn khi có. Trả lời bằng tiếng Việt.",
    toolsEnabled: false,
    preferOpenAI: "gpt-5.2",
  },
  {
    id: "computer",
    name: "Computer use agent",
    description: "Điều khiển màn hình, chuột, bàn phím",
    icon: Pencil,
    systemPrompt:
      "Bạn là tác nhân điều khiển máy tính cẩn trọng. Luôn chụp màn hình hoặc vision_annotate trước khi click. Mô tả ngắn việc sắp làm trước khi gọi tool. Tiếng Việt.",
    toolsEnabled: true,
    preferOllama: "qwen2.5vl",
  },
];
