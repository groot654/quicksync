/** Browser-only helpers for the service worker and Web Push. */

/** How long to wait for the service worker on a first visit, before it has installed. */
const REGISTRATION_WAIT_MS = 5_000;

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/**
 * The app's service worker registration, or `null` when there is none (unsupported
 * browsers, and development, where the worker isn't registered).
 */
export async function getServiceWorkerRegistration({
  wait = true,
}: { wait?: boolean } = {}): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing || !wait || process.env.NODE_ENV !== "production") return existing ?? null;

    // First visit: ServiceWorkerRegister is still installing the worker.
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), REGISTRATION_WAIT_MS)),
    ]);
  } catch {
    return null;
  }
}

export async function getPushSubscription(options?: {
  wait?: boolean;
}): Promise<PushSubscription | null> {
  const registration = await getServiceWorkerRegistration(options);
  if (!registration?.pushManager) return null;
  try {
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * This device's push endpoint, if it has notifications on. Sent with each message so the
 * server doesn't notify the device that sent it. Never waits for the worker to install.
 */
export async function getCurrentPushEndpoint(): Promise<string | undefined> {
  if (typeof navigator === "undefined") return undefined;
  const subscription = await getPushSubscription({ wait: false });
  return subscription?.endpoint ?? undefined;
}

/** Decodes a base64url VAPID key into the bytes `pushManager.subscribe` expects. */
export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** False when the subscription was made with a different VAPID key (keys were rotated). */
export function usesServerKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true; // Some browsers don't expose it; assume it matches.
  const expected = decodeBase64Url(publicKey);
  const actual = new Uint8Array(current);
  return actual.length === expected.length && actual.every((byte, i) => byte === expected[i]);
}

/** Closes notifications that are already showing; the app now displays the messages. */
export async function closeDeliveredNotifications(): Promise<void> {
  const registration = await getServiceWorkerRegistration({ wait: false });
  if (!registration?.getNotifications) return;
  try {
    const notifications = await registration.getNotifications();
    notifications.forEach((notification) => notification.close());
  } catch {
    // Nothing to clean up.
  }
}
