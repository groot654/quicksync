// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callsOf, createFakeSupabase, type QueryResult } from "./fake-supabase";

const getAuthContext = vi.fn();
vi.mock("@/features/auth/dal", () => ({ getAuthContext: () => getAuthContext() }));

const { removePushSubscription, savePushSubscription } =
  await import("@/features/notifications/actions");

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "me@example.com" };
const SUBSCRIPTION = {
  endpoint: "https://fcm.googleapis.com/fcm/send/device",
  expirationTime: null,
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ", auth: "tBHItJI5svbpez7KI4CCXg" },
};

function signedIn(results: QueryResult[]) {
  const fake = createFakeSupabase(results);
  getAuthContext.mockResolvedValue({ supabase: fake.client, user: USER });
  return fake;
}

beforeEach(() => {
  getAuthContext.mockReset();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:owner@example.com");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("savePushSubscription", () => {
  it("refuses unauthenticated callers", async () => {
    getAuthContext.mockResolvedValue(null);
    const result = await savePushSubscription(SUBSCRIPTION);
    expect(!result.ok && result.error.code).toBe("UNAUTHORIZED");
  });

  it("registers through the RPC, which takes the owner from the JWT", async () => {
    const fake = signedIn([{ data: "subscription-id" }]);
    const result = await savePushSubscription(SUBSCRIPTION);

    expect(result).toEqual({ ok: true, data: null });
    expect(fake.rpc).toHaveBeenCalledWith("register_push_subscription", {
      p_endpoint: SUBSCRIPTION.endpoint,
      p_p256dh: SUBSCRIPTION.keys.p256dh,
      p_auth: SUBSCRIPTION.keys.auth,
    });
  });

  it("refuses endpoints that aren't a known push service", async () => {
    const fake = signedIn([]);
    const result = await savePushSubscription({
      ...SUBSCRIPTION,
      endpoint: "https://169.254.169.254/latest/meta-data",
    });
    expect(!result.ok && result.error.code).toBe("VALIDATION");
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("explains when the server has no push keys", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const fake = signedIn([]);
    const result = await savePushSubscription(SUBSCRIPTION);
    expect(!result.ok && result.error.code).toBe("SERVER");
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("reports database failures safely", async () => {
    signedIn([{ error: { code: "42501" } }]);
    const result = await savePushSubscription(SUBSCRIPTION);
    expect(!result.ok && result.error.code).toBe("SERVER");
  });
});

describe("removePushSubscription", () => {
  it("deletes only the signed-in user's subscription", async () => {
    const fake = signedIn([{ error: null }]);
    const result = await removePushSubscription({ endpoint: SUBSCRIPTION.endpoint });

    expect(result.ok).toBe(true);
    expect(fake.queries[0].table).toBe("push_subscriptions");
    expect(callsOf(fake.queries[0], "eq")).toEqual([
      ["user_id", USER.id],
      ["endpoint", SUBSCRIPTION.endpoint],
    ]);
  });

  it("refuses unauthenticated callers", async () => {
    getAuthContext.mockResolvedValue(null);
    const result = await removePushSubscription({ endpoint: SUBSCRIPTION.endpoint });
    expect(!result.ok && result.error.code).toBe("UNAUTHORIZED");
  });
});
