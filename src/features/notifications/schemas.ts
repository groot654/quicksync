import { z } from "zod";

/**
 * Push services used by current browsers: Chrome, Edge on Android, Samsung Internet and
 * Opera (Google FCM), Safari (Apple), Firefox (Mozilla) and Edge on Windows (WNS).
 *
 * The server sends requests to whatever endpoint is stored, so only these hosts are
 * accepted. Anything else could turn the push sender into a way to reach internal URLs.
 */
const PUSH_SERVICE_HOSTS = [
  "googleapis.com",
  "push.apple.com",
  "push.services.mozilla.com",
  "notify.windows.com",
] as const;

export function isAllowedPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

const INVALID_SUBSCRIPTION = "This browser returned an invalid push subscription.";

/** Unpadded or padded base64url, as produced by `PushSubscription.toJSON()`. */
const base64Url = (max: number) =>
  z
    .string({ error: INVALID_SUBSCRIPTION })
    .min(1, { error: INVALID_SUBSCRIPTION })
    .max(max, { error: INVALID_SUBSCRIPTION })
    .regex(/^[A-Za-z0-9_-]+={0,2}$/, { error: INVALID_SUBSCRIPTION });

export const pushEndpointSchema = z
  .string({ error: INVALID_SUBSCRIPTION })
  .max(2048, { error: INVALID_SUBSCRIPTION })
  .refine(isAllowedPushEndpoint, { error: "This browser's push service isn't supported." });

export const savePushSubscriptionSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: z.object({ p256dh: base64Url(256), auth: base64Url(64) }),
});

export const removePushSubscriptionSchema = z.object({
  endpoint: z.string().min(1).max(2048),
});

export type SavePushSubscriptionInput = z.infer<typeof savePushSubscriptionSchema>;
