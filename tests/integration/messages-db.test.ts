import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fetchActiveMessages } from "@/features/messages/queries";

import {
  adminClient,
  anonClient,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from "./helpers";

const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";

let admin: Client;
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  admin = adminClient();
  alice = await createTestUser(admin, "alice");
  bob = await createTestUser(admin, "bob");
});

afterAll(async () => {
  await deleteTestUser(admin, alice);
  await deleteTestUser(admin, bob);
});

async function insertAs(user: TestUser, content: string, clientId = randomUUID()) {
  return user.client
    .from("messages")
    .insert({ user_id: user.id, client_id: clientId, content })
    .select("id, content, created_at, expires_at")
    .single();
}

describe("auth configuration", () => {
  it("rejects public sign-ups (only accounts created by the owner can exist)", async () => {
    const { data, error } = await anonClient().auth.signUp({
      email: `intruder-${randomUUID().slice(0, 8)}@example.com`,
      password: `pw-${randomUUID()}`,
    });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });
});

describe("messages table: ownership and access", () => {
  it("blocks unauthenticated (anon) reads and writes entirely", async () => {
    const anon = anonClient();
    const read = await anon.from("messages").select("id");
    expect(read.error?.code).toBe(PERMISSION_DENIED);

    const write = await anon
      .from("messages")
      .insert({ client_id: randomUUID(), content: "hello", user_id: alice.id });
    expect(write.error?.code).toBe(PERMISSION_DENIED);
  });

  it("stores a message for its owner with server-assigned 24h expiry", async () => {
    const content = "Your code is 482913\nDo not share it. ✅ — ünïcödé";
    const { data, error } = await insertAs(alice, content);

    expect(error).toBeNull();
    expect(data!.content).toBe(content); // Exact round trip: newlines and Unicode intact.

    const lifetimeMs = Date.parse(data!.expires_at) - Date.parse(data!.created_at);
    expect(lifetimeMs).toBe(24 * 60 * 60 * 1000);
  });

  it("defaults user_id to the authenticated user", async () => {
    const { data, error } = await alice.client
      .from("messages")
      .insert({ client_id: randomUUID(), content: "no explicit owner" })
      .select("id")
      .single();
    expect(error).toBeNull();

    const row = await admin.from("messages").select("user_id").eq("id", data!.id).single();
    expect(row.data!.user_id).toBe(alice.id);
  });

  it("rejects inserting a message on behalf of another user", async () => {
    const { error } = await alice.client
      .from("messages")
      .insert({ user_id: bob.id, client_id: randomUUID(), content: "spoofed" });
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it("does not let clients choose their own timestamps", async () => {
    const { error } = await alice.client.from("messages").insert({
      client_id: randomUUID(),
      content: "keep me forever",
      expires_at: "2999-01-01T00:00:00Z",
    });
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it("hides other users' messages and prevents deleting them", async () => {
    const { data: message } = await insertAs(alice, "alice private");

    const bobRead = await bob.client.from("messages").select("id").eq("id", message!.id);
    expect(bobRead.error).toBeNull();
    expect(bobRead.data).toEqual([]);

    const bobDelete = await bob.client.from("messages").delete().eq("id", message!.id).select("id");
    expect(bobDelete.data).toEqual([]);

    const stillThere = await admin.from("messages").select("id").eq("id", message!.id);
    expect(stillThere.data).toHaveLength(1);
  });

  it("lets owners delete their own messages", async () => {
    const { data: message } = await insertAs(alice, "delete me");
    const { data, error } = await alice.client
      .from("messages")
      .delete()
      .eq("id", message!.id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: message!.id }]);
  });

  it("does not allow editing messages", async () => {
    const { data: message } = await insertAs(alice, "immutable");
    const { error } = await alice.client
      .from("messages")
      .update({ content: "changed" })
      .eq("id", message!.id);
    expect(error?.code).toBe(PERMISSION_DENIED);
  });
});

describe("messages table: validation", () => {
  it("rejects empty and whitespace-only content", async () => {
    expect((await insertAs(alice, "")).error?.code).toBe(CHECK_VIOLATION);
    expect((await insertAs(alice, "  \n\t ")).error?.code).toBe(CHECK_VIOLATION);
  });

  it("accepts 10,000 characters and rejects 10,001", async () => {
    expect((await insertAs(alice, "a".repeat(10_000))).error).toBeNull();
    expect((await insertAs(alice, "a".repeat(10_001))).error?.code).toBe(CHECK_VIOLATION);
  });

  it("counts characters, not UTF-16 units, like the client does", async () => {
    // 10,000 emoji = 20,000 UTF-16 units but 10,000 characters.
    expect((await insertAs(alice, "😀".repeat(10_000))).error).toBeNull();
  });

  it("rejects a duplicate client_id, which makes retries idempotent", async () => {
    const clientId = randomUUID();
    expect((await insertAs(alice, "first", clientId)).error).toBeNull();
    expect((await insertAs(alice, "retry", clientId)).error?.code).toBe(UNIQUE_VIOLATION);

    // The same key used by a different user is unrelated and allowed.
    expect((await insertAs(bob, "bob's own", clientId)).error).toBeNull();
  });
});

describe("messages table: expiration", () => {
  it("hides expired messages from queries, even before cleanup runs", async () => {
    const { data: message } = await insertAs(alice, "about to expire");
    await admin
      .from("messages")
      .update({
        created_at: new Date(Date.now() - 25 * 3600_000).toISOString(),
        expires_at: new Date(Date.now() - 3600_000).toISOString(),
      })
      .eq("id", message!.id);

    const direct = await alice.client.from("messages").select("id").eq("id", message!.id);
    expect(direct.data).toEqual([]);

    const page = await fetchActiveMessages(alice.client, { userId: alice.id, limit: 100 });
    expect(page.ok && page.page.messages.some((m) => m.id === message!.id)).toBe(false);
  });

  it("physically deletes expired messages with purge_expired_messages()", async () => {
    const { data: expired } = await insertAs(alice, "expired");
    const { data: active } = await insertAs(alice, "active");
    await admin
      .from("messages")
      .update({
        created_at: new Date(Date.now() - 48 * 3600_000).toISOString(),
        expires_at: new Date(Date.now() - 1000).toISOString(),
      })
      .eq("id", expired!.id);

    const { data: deleted, error } = await admin.rpc("purge_expired_messages");
    expect(error).toBeNull();
    expect(deleted).toBeGreaterThanOrEqual(1);

    const remaining = await admin.from("messages").select("id").in("id", [expired!.id, active!.id]);
    expect(remaining.data).toEqual([{ id: active!.id }]);
  });

  it("does not let regular users run the cleanup function", async () => {
    const { error } = await alice.client.rpc("purge_expired_messages");
    expect(error).not.toBeNull();
  });
});

describe("fetchActiveMessages pagination", () => {
  it("pages through all messages newest-first without gaps or duplicates", async () => {
    const user = await createTestUser(admin, "pager");
    try {
      const inserted: string[] = [];
      for (let i = 0; i < 7; i++) {
        const { data } = await insertAs(user, `message ${i}`);
        inserted.push(data!.id);
      }

      const seen: string[] = [];
      let before: { id: string; created_at: string } | undefined;
      for (;;) {
        const result = await fetchActiveMessages(user.client, {
          userId: user.id,
          before,
          limit: 3,
        });
        if (!result.ok) throw new Error(result.code);
        seen.push(...result.page.messages.map((message) => message.id));
        if (!result.page.hasMore) break;
        before = result.page.messages.at(-1);
      }

      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
      expect(seen).toEqual([...inserted].reverse());
    } finally {
      await deleteTestUser(admin, user);
    }
  });
});
