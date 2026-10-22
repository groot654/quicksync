"use server";

import {
  fail,
  logServerError,
  ok,
  UNAUTHORIZED_MESSAGE,
  type ActionResult,
} from "@/lib/action-result";
import { getAuthContext } from "@/features/auth/dal";
import { getPushConfig } from "@/lib/env";

import { removePushSubscriptionSchema, savePushSubscriptionSchema } from "./schemas";

/** Registers this browser's push subscription for the signed-in user. Safe to repeat. */
export async function savePushSubscription(input: unknown): Promise<ActionResult<null>> {
  const auth = await getAuthContext();
  if (!auth) return fail("UNAUTHORIZED", UNAUTHORIZED_MESSAGE);

  if (!getPushConfig()) {
    return fail("SERVER", "Notifications aren't set up on this server yet.");
  }

  const parsed = savePushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0].message);

  const { endpoint, keys } = parsed.data;
  // The function takes the owner from the JWT, never from the browser.
  const { error } = await auth.supabase.rpc("register_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  });

  if (error) {
    logServerError("push.register", error);
    return fail("SERVER", "Couldn't turn on notifications. Please try again.");
  }
  return ok(null);
}

/** Stops notifications for one of the signed-in user's devices. */
export async function removePushSubscription(input: unknown): Promise<ActionResult<null>> {
  const auth = await getAuthContext();
  if (!auth) return fail("UNAUTHORIZED", UNAUTHORIZED_MESSAGE);

  const parsed = removePushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Invalid subscription.");

  const { error } = await auth.supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("endpoint", parsed.data.endpoint);

  if (error) {
    logServerError("push.remove", error);
    return fail("SERVER", "Couldn't turn off notifications. Please try again.");
  }
  return ok(null);
}
