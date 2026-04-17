/**
 * Cross-conversation memory store.
 * Memories are short facts the assistant has learned about the user
 * (preferences, projects, recurring context). Top-N by importance are
 * injected into the system prompt of every new conversation.
 */
import { supabase } from "@/integrations/supabase/client";

export interface UserMemory {
  id: string;
  fact: string;
  importance: number;
  source_conversation_id: string | null;
  created_at: string;
  updated_at: string;
}

const TOP_N = 10;

export async function loadTopMemories(userId: string, limit = TOP_N): Promise<UserMemory[]> {
  const { data, error } = await supabase
    .from("user_memories")
    .select("id,fact,importance,source_conversation_id,created_at,updated_at")
    .eq("user_id", userId)
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("loadTopMemories failed:", error.message);
    return [];
  }
  return (data ?? []) as UserMemory[];
}

export async function listAllMemories(userId: string): Promise<UserMemory[]> {
  const { data, error } = await supabase
    .from("user_memories")
    .select("id,fact,importance,source_conversation_id,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserMemory[];
}

export async function addMemory(
  userId: string,
  fact: string,
  opts: { importance?: number; sourceConversationId?: string | null } = {},
): Promise<UserMemory | null> {
  const trimmed = fact.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase
    .from("user_memories")
    .insert({
      user_id: userId,
      fact: trimmed,
      importance: Math.max(1, Math.min(10, opts.importance ?? 5)),
      source_conversation_id: opts.sourceConversationId ?? null,
    })
    .select("id,fact,importance,source_conversation_id,created_at,updated_at")
    .single();
  if (error) {
    console.warn("addMemory failed:", error.message);
    return null;
  }
  return data as UserMemory;
}

export async function updateMemory(
  id: string,
  patch: Partial<Pick<UserMemory, "fact" | "importance">>,
): Promise<void> {
  const { error } = await supabase.from("user_memories").update(patch).eq("id", id);
  if (error) throw error;
}

export async function forgetMemory(id: string): Promise<void> {
  const { error } = await supabase.from("user_memories").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Format a list of memories as a system-prompt block.
 * Returns empty string when nothing to inject so callers can simple concat.
 */
export function formatMemoriesForPrompt(memories: UserMemory[]): string {
  if (!memories.length) return "";
  const lines = memories
    .slice(0, TOP_N)
    .map((m, i) => `${i + 1}. ${m.fact}`)
    .join("\n");
  return `\n\n[Long-term memory about this user — apply silently when relevant, don't repeat back unless asked]\n${lines}`;
}
