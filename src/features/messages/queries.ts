import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { MESSAGE_COLUMNS, MESSAGE_PAGE_SIZE } from "./constants";
import type { Message, MessagePage } from "./types";

type Client = SupabaseClient<Database>;

export type FetchMessagesOptions = {
  userId: string;
  /** Keyset cursor: return messages older than this one. */
  before?: Pick<Message, "id" | "created_at">;
  limit?: number;
};

export type FetchMessagesResult = { ok: true; page: MessagePage } | { ok: false; code: string };

/**
 * Fetches a page of the user's active messages, newest first.
 *
 * Works with both the server and browser clients. Row Level Security already limits
 * results to the signed-in user's unexpired rows; the explicit filters keep queries on
 * the `(user_id, created_at, id)` index and make the intent obvious.
 */
export async function fetchActiveMessages(
  supabase: Client,
  { userId, before, limit = MESSAGE_PAGE_SIZE }: FetchMessagesOptions,
): Promise<FetchMessagesResult> {
  let query = supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (before) {
    query = query.or(
      `created_at.lt."${before.created_at}",and(created_at.eq."${before.created_at}",id.lt.${before.id})`,
    );
  }

  const { data, error } = await query;
  if (error) return { ok: false, code: error.code || "unknown" };

  return {
    ok: true,
    page: { messages: data.slice(0, limit), hasMore: data.length > limit },
  };
}

/**
 * Realtime topics must start with this prefix; the `realtime.messages` RLS policy only
 * lets the owner join it. Keep in sync with the private_realtime_channel migration.
 */
export function realtimeTopicPrefix(userId: string): string {
  return `quicksync:${userId}:`;
}

/** Narrows a Realtime payload row to the fields the UI uses. */
export function toMessage(row: unknown): Message | null {
  if (typeof row !== "object" || row === null) return null;
  const { id, content, created_at, expires_at } = row as Record<string, unknown>;
  if (
    typeof id !== "string" ||
    typeof content !== "string" ||
    typeof created_at !== "string" ||
    typeof expires_at !== "string"
  ) {
    return null;
  }
  return { id, content, created_at, expires_at };
}
