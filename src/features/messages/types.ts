import type { Database } from "@/types/database";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

/** A message as delivered to the browser. */
export type Message = Pick<MessageRow, "id" | "content" | "created_at" | "expires_at">;

export type MessagePage = {
  messages: Message[];
  /** True when older messages exist beyond this page. */
  hasMore: boolean;
};

export type SyncStatus = "connecting" | "connected" | "reconnecting" | "offline";
