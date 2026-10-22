import { randomUUID } from "node:crypto";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { realtimeTopicPrefix, toMessage } from "@/features/messages/queries";

import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUser,
  sleep,
  waitFor,
  type Client,
  type TestUser,
} from "./helpers";

let admin: Client;
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  admin = adminClient();
  alice = await createTestUser(admin, "rt-alice");
  bob = await createTestUser(admin, "rt-bob");
});

afterAll(async () => {
  await deleteTestUser(admin, alice);
  await deleteTestUser(admin, bob);
});

type Received = { inserts: Record<string, unknown>[]; deletes: Record<string, unknown>[] };

type SubscribeOptions = { topicOwnerId: string; filterUserId: string; isPrivate?: boolean };

/** Subscribes exactly like the app (private channel, wait for server confirmation). */
function subscribe(
  client: Client,
  { topicOwnerId, filterUserId, isPrivate = true }: SubscribeOptions,
): { channel: RealtimeChannel; received: Received; ready: Promise<void> } {
  const received: Received = { inserts: [], deletes: [] };

  const channel = client
    .channel(`${realtimeTopicPrefix(topicOwnerId)}${randomUUID()}`, {
      config: { private: isPrivate, postgres_changes_options: { wait: true } },
    })
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `user_id=eq.${filterUserId}`,
      },
      (payload) => received.inserts.push(payload.new),
    )
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) =>
      received.deletes.push(payload.old),
    );

  const ready = (async () => {
    const { data } = await client.auth.getSession();
    if (data.session) await client.realtime.setAuth(data.session.access_token);
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          reject(error ?? new Error(status));
      });
    });
  })();

  return { channel, received, ready };
}

async function sendAs(user: TestUser, content: string) {
  const { data, error } = await user.client
    .from("messages")
    .insert({ user_id: user.id, client_id: randomUUID(), content })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

describe("Realtime delivery", () => {
  it("delivers a message sent from one device to another device of the same user", async () => {
    // "iPhone": a second, independent session for the same account.
    const iphone = anonClient();
    const { data: link } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: alice.email,
    });
    const { error: otpError } = await iphone.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.properties!.hashed_token,
    });
    expect(otpError).toBeNull();

    const { channel, received, ready } = subscribe(iphone, {
      topicOwnerId: alice.id,
      filterUserId: alice.id,
    });
    await ready;

    // "Android" sends with the first session.
    const content = `Your code is 123456\n${randomUUID()}`;
    const id = await sendAs(alice, content);

    const insert = await waitFor(() => received.inserts.map(toMessage).find((m) => m?.id === id));
    expect(insert?.content).toBe(content);

    // Deleting on one device notifies the other with just the id.
    await alice.client.from("messages").delete().eq("id", id);
    const deletion = await waitFor(() => received.deletes.find((row) => row.id === id));
    expect(deletion).toEqual({ id });

    await iphone.removeChannel(channel);
  });

  it("refuses to let another user join someone else's private channel", async () => {
    const { channel, ready } = subscribe(bob.client, {
      topicOwnerId: alice.id,
      filterUserId: alice.id,
    });
    await expect(ready).rejects.toThrow();
    await bob.client.removeChannel(channel);
  });

  it("never delivers another user's messages on one's own channel, even with a forged filter", async () => {
    const { channel, received, ready } = subscribe(bob.client, {
      topicOwnerId: bob.id,
      filterUserId: alice.id,
    });
    await ready;

    const id = await sendAs(alice, "secret for alice");
    await sleep(2500);
    expect(received.inserts.find((row) => row.id === id)).toBeUndefined();
    expect(received.inserts.some((row) => "content" in row)).toBe(false);

    await bob.client.removeChannel(channel);
  });

  it("refuses unauthenticated sockets on private channels", async () => {
    const anon = anonClient();
    const { channel, ready } = subscribe(anon, { topicOwnerId: alice.id, filterUserId: alice.id });
    await expect(ready).rejects.toThrow();
    await anon.removeChannel(channel);
  });

  it("never exposes message content to unauthenticated public channels", async () => {
    // Public channels are refused in production when Realtime "Allow public access" is
    // disabled. Even where they are allowed (local dev), RLS strips every row.
    const anon = anonClient();
    const { channel, received, ready } = subscribe(anon, {
      topicOwnerId: "public",
      filterUserId: alice.id,
      isPrivate: false,
    });
    await ready.catch(() => undefined);

    await sendAs(alice, "not for anon");
    await sleep(2500);

    expect(received.inserts.some((row) => "content" in row)).toBe(false);
    await anon.removeChannel(channel);
  });
});
