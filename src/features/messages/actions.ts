"use server";

import { after } from "next/server";

import {
  fail,
  logServerError,
  ok,
  UNAUTHORIZED_MESSAGE,
  type ActionResult,
} from "@/lib/action-result";
import { getAuthContext } from "@/features/auth/dal";
import { notifyNewMessage } from "@/features/notifications/send";

import { MESSAGE_COLUMNS } from "./constants";
import { createMessageSchema, deleteMessageSchema } from "./schemas";
import type { Message } from "./types";

const UNIQUE_VIOLATION = "23505";

/**
 * Stores a message for the signed-in user.
 *
 * Idempotent: the browser sends a `clientId` per submission and reuses it when
 * retrying, so a retry after a lost response returns the original message instead of
 * creating a duplicate.
 */
export async function createMessage(input: unknown): Promise<ActionResult<Message>> {
  const auth = await getAuthContext();
  if (!auth) return fail("UNAUTHORIZED", UNAUTHORIZED_MESSAGE);

  const parsed = createMessageSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0].message);

  const { supabase, user } = auth;
  const { clientId, content, sourceEndpoint } = parsed.data;

  const { data, error } = await supabase
    .from("messages")
    // user_id comes from the verified session, never from the browser. RLS also
    // rejects any row whose user_id differs from the JWT subject.
    .insert({ user_id: user.id, client_id: clientId, content })
    .select(MESSAGE_COLUMNS)
    .single();

  if (!error) {
    // Notify the user's other devices once the response has been sent.
    after(() => notifyNewMessage({ supabase, userId: user.id, message: data, sourceEndpoint }));
    return ok(data);
  }

  // A retry of a message that was already stored: its notification went out the first time.
  if (error.code === UNIQUE_VIOLATION) {
    const existing = await supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("user_id", user.id)
      .eq("client_id", clientId)
      .maybeSingle();

    if (existing.data) return ok(existing.data);
  }

  logServerError("messages.create", error);
  return fail("SERVER", "Couldn't send your message. Please try again.");
}

export async function deleteMessage(input: unknown): Promise<ActionResult<{ id: string }>> {
  const auth = await getAuthContext();
  if (!auth) return fail("UNAUTHORIZED", UNAUTHORIZED_MESSAGE);

  const parsed = deleteMessageSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0].message);

  const { supabase, user } = auth;
  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", user.id);

  if (error) {
    logServerError("messages.delete", error);
    return fail("SERVER", "Couldn't delete the message. Please try again.");
  }

  // Deleting a message that is already gone (on another device, or expired) is a success.
  return ok({ id: parsed.data.id });
}

export async function clearMessages(): Promise<ActionResult<{ deleted: number }>> {
  const auth = await getAuthContext();
  if (!auth) return fail("UNAUTHORIZED", UNAUTHORIZED_MESSAGE);

  const { supabase, user } = auth;
  const { error, count } = await supabase
    .from("messages")
    .delete({ count: "exact" })
    .eq("user_id", user.id);

  if (error) {
    logServerError("messages.clear", error);
    return fail("SERVER", "Couldn't clear your messages. Please try again.");
  }

  return ok({ deleted: count ?? 0 });
}
