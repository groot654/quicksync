import { z } from "zod";

/**
 * What the user chose on a notification. The service worker (public/sw.js) passes it to
 * the app, either by `postMessage` to an open window or as URL parameters on a new one.
 * Only the action and the message id travel this way, never the message content.
 */
export const NOTIFICATION_MESSAGE_TYPE = "quicksync:notification";

export const NOTIFICATION_URL_PARAMS = { action: "notification", message: "message" } as const;

const intentSchema = z.object({
  action: z.enum(["copy-code", "copy", "open"]),
  messageId: z.uuid(),
});

export type NotificationIntent = z.infer<typeof intentSchema>;

/** Reads an intent posted by the service worker. */
export function parseNotificationMessage(data: unknown): NotificationIntent | null {
  if (typeof data !== "object" || data === null) return null;
  if ((data as { type?: unknown }).type !== NOTIFICATION_MESSAGE_TYPE) return null;
  const parsed = intentSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Reads an intent from the URL the service worker opened. */
export function parseNotificationUrl(search: string): NotificationIntent | null {
  const params = new URLSearchParams(search);
  const parsed = intentSchema.safeParse({
    action: params.get(NOTIFICATION_URL_PARAMS.action),
    messageId: params.get(NOTIFICATION_URL_PARAMS.message),
  });
  return parsed.success ? parsed.data : null;
}
