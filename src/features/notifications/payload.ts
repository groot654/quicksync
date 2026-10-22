import type { Message } from "@/features/messages/types";
import { extractOtp } from "@/lib/otp";

/** Keeps the encrypted payload well under the 4 KB Web Push limit. */
export const PUSH_PREVIEW_CHARS = 240;

/**
 * What the service worker receives for a new message. Keep in sync with the `push`
 * handler in public/sw.js.
 */
export type MessagePushPayload = {
  type: "message";
  id: string;
  title: string;
  body: string;
  /** A detected one-time code, shown in the notification with a "Copy code" action. */
  code: string | null;
  createdAt: string;
};

/** Shortens text to `max` code points (not UTF-16 units, so emoji are never split). */
export function truncatePreview(content: string, max = PUSH_PREVIEW_CHARS): string {
  const chars = Array.from(content.trim());
  if (chars.length <= max) return chars.join("");
  return `${chars
    .slice(0, max - 1)
    .join("")
    .trimEnd()}…`;
}

/** Groups a code for easier reading in a notification title: 482913 → "482 913". */
export function formatCode(code: string): string {
  if (code.length === 6 || code.length === 8) {
    const half = code.length / 2;
    return `${code.slice(0, half)} ${code.slice(half)}`;
  }
  return code;
}

export function buildMessagePushPayload(message: Message): MessagePushPayload {
  const code = extractOtp(message.content);
  return {
    type: "message",
    id: message.id,
    title: code ? `Code ${formatCode(code)}` : "New message",
    body: truncatePreview(message.content),
    code,
    createdAt: message.created_at,
  };
}
