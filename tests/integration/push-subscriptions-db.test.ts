import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

let admin: Client;
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  admin = adminClient();
  alice = await createTestUser(admin, "push-alice");
  bob = await createTestUser(admin, "push-bob");
});

afterAll(async () => {
  await deleteTestUser(admin, alice);
  await deleteTestUser(admin, bob);
});

const endpoint = () => `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;

function register(user: TestUser, url: string) {
  return user.client.rpc("register_push_subscription", {
    p_endpoint: url,
    p_p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ",
    p_auth: "tBHItJI5svbpez7KI4CCXg",
  });
}

async function ownerOf(url: string) {
  const { data } = await admin
    .from("push_subscriptions")
    .select("user_id")
    .eq("endpoint", url)
    .maybeSingle();
  return data?.user_id ?? null;
}

describe("push_subscriptions", () => {
  it("registers a device for the caller, taking the owner from the JWT", async () => {
    const url = endpoint();
    const { data, error } = await register(alice, url);
    expect(error).toBeNull();
    expect(typeof data).toBe("string");
    expect(await ownerOf(url)).toBe(alice.id);
  });

  it("is idempotent for the same device", async () => {
    const url = endpoint();
    await register(alice, url);
    const { error } = await register(alice, url);
    expect(error).toBeNull();
    const { count } = await admin
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("endpoint", url);
    expect(count).toBe(1);
  });

  it("moves a shared browser's endpoint to the account that registers it last", async () => {
    const url = endpoint();
    await register(alice, url);
    await register(bob, url);
    expect(await ownerOf(url)).toBe(bob.id);
  });

  it("lets users read and delete only their own subscriptions", async () => {
    const mine = endpoint();
    const theirs = endpoint();
    await register(alice, mine);
    await register(bob, theirs);

    const { data: visible } = await alice.client.from("push_subscriptions").select("endpoint");
    const endpoints = (visible ?? []).map((row) => row.endpoint);
    expect(endpoints).toContain(mine);
    expect(endpoints).not.toContain(theirs);

    await alice.client.from("push_subscriptions").delete().eq("endpoint", theirs);
    expect(await ownerOf(theirs)).toBe(bob.id);

    await alice.client.from("push_subscriptions").delete().eq("endpoint", mine);
    expect(await ownerOf(mine)).toBeNull();
  });

  it("refuses direct inserts, so the owner can't be spoofed", async () => {
    const { error } = await alice.client.from("push_subscriptions").insert({
      user_id: bob.id,
      endpoint: endpoint(),
      p256dh: "key",
      auth: "auth",
    });
    expect(error?.code).toBe(PERMISSION_DENIED);
  });

  it("refuses non-HTTPS endpoints", async () => {
    const { error } = await register(alice, "http://fcm.googleapis.com/fcm/send/x");
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it("gives anonymous callers no access", async () => {
    const anon = anonClient();
    const { error: rpcError } = await anon.rpc("register_push_subscription", {
      p_endpoint: endpoint(),
      p_p256dh: "key",
      p_auth: "auth",
    });
    expect(rpcError).not.toBeNull();

    const { error: selectError } = await anon.from("push_subscriptions").select("id");
    expect(selectError?.code).toBe(PERMISSION_DENIED);
  });
});
