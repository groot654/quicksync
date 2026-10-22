import "server-only";

import webpush, { WebPushError } from "web-push";

import type { Message } from "@/features/messages/types";
import { logServerError } from "@/lib/action-result";
import { getPushConfig } from "@/lib/env";
import type { ServerSupabaseClient } from "@/lib/supabase/server";

import { buildMessagePushPayload } from "./payload";

/** The push service reports these when a subscription has been revoked or has expired. */
const GONE_STATUSES = new Set([404, 410]);

/** One-time codes are useless after a few minutes, so don't deliver them late. */
const CODE_TTL_SECONDS = 10 * 60;
const MESSAGE_TTL_SECONDS = 60 * 60;
const SEND_TIMEOUT_MS = 10_000;

export type NotifyNewMessageOptions = {
  supabase: ServerSupabaseClient;
  userId: string;
  message: Message;
  /** The sending device's own endpoint; it already shows the message. */
  sourceEndpoint?: string;
};

/**
 * Sends a Web Push notification about a new message to the user's other devices.
 *
 * Runs after the Server Action has responded (via `after()`), so it never slows down
 * sending. Failures are logged by status code only and never surface to the sender.
 * Subscriptions the push service reports as gone are deleted.
 */
export async function notifyNewMessage({
  supabase,
  userId,
  message,
  sourceEndpoint,
}: NotifyNewMessageOptions): Promise<void> {
  const config = getPushConfig();
  if (!config) return; // Push notifications are not configured for this deployment.

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    logServerError("push.list", error);
    return;
  }

  const targets = data.filter((subscription) => subscription.endpoint !== sourceEndpoint);
  if (targets.length === 0) return;

  const payload = buildMessagePushPayload(message);
  const body = JSON.stringify(payload);
  const gone: string[] = [];

  await Promise.all(
    targets.map(async ({ endpoint, p256dh, auth }) => {
      try {
        await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, body, {
          vapidDetails: config,
          TTL: payload.code ? CODE_TTL_SECONDS : MESSAGE_TTL_SECONDS,
          urgency: "high",
          timeout: SEND_TIMEOUT_MS,
        });
      } catch (sendError) {
        if (sendError instanceof WebPushError && GONE_STATUSES.has(sendError.statusCode)) {
          gone.push(endpoint);
          return;
        }
        // Only the status code: push service error bodies are not needed and the
        // request itself carried message content.
        const status = sendError instanceof WebPushError ? sendError.statusCode : "network";
        logServerError("push.send", { code: String(status) });
      }
    }),
  );

  if (gone.length > 0) {
    const { error: deleteError } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .in("endpoint", gone);
    if (deleteError) logServerError("push.prune", deleteError);
  }
}
