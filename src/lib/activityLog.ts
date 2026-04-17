import { supabase } from "@/integrations/supabase/client";
import type { RiskLevel } from "./tools";

export interface ActivityLogEntry {
  user_id: string;
  conversation_id?: string | null;
  message_id?: string | null;
  tool_name: string;
  args?: Record<string, any> | null;
  risk: RiskLevel;
  status: "done" | "denied" | "error";
  output?: string | null;
}

export async function logActivity(entry: ActivityLogEntry): Promise<void> {
  try {
    await supabase.from("activity_log").insert({
      user_id: entry.user_id,
      conversation_id: entry.conversation_id ?? null,
      message_id: entry.message_id ?? null,
      tool_name: entry.tool_name,
      args: entry.args ?? null,
      risk: entry.risk,
      status: entry.status,
      output: entry.output?.slice(0, 4000) ?? null,
    });
  } catch (e) {
    // Audit logging must never break the app
    console.warn("activity_log insert failed", e);
  }
}
