// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callsOf, createFakeSupabase } from "./fake-supabase";

const sendNotification = vi.fn();

vi.mock("web-push", () => {
  class WebPushError extends Error {
    constructor(
      message: string,
      public statusCode: number,
    ) {
      super(message);
    }
  }
  return { default: { sendNotification }, WebPushError };
});

const { WebPushError } = (await import("web-push")) as unknown as {
  WebPushError: new (message: string, statusCode: number) => Error;
};
const { notifyNewMessage } = await import("@/features/notifications/send");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SENDER = "https://fcm.googleapis.com/fcm/send/sender";
const PHONE = "https://web.push.apple.com/phone";
const OLD_TABLET = "https://fcm.googleapis.com/fcm/send/old-tablet";

const message = {
  id: "9d7a4f3e-2b1c-4d5e-8f6a-7b8c9d0e1f2a",
  content: "Your login code is 731904",
  created_at: "2026-10-22T10:00:00.000Z",
  expires_at: "2026-10-23T10:00:00.000Z",
};

const subscription = (endpoint: string) => ({ endpoint, p256dh: "p256dh", auth: "auth" });

beforeEach(() => {
  sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:owner@example.com");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("notifyNewMessage", () => {
  it("does nothing when push isn't configured", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const fake = createFakeSupabase([]);
    await notifyNewMessage({ supabase: fake.client, userId: USER_ID, message });
    expect(fake.from).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("notifies every other device of the owner, not the sender", async () => {
    const fake = createFakeSupabase([{ data: [subscription(SENDER), subscription(PHONE)] }]);

    await notifyNewMessage({
      supabase: fake.client,
      userId: USER_ID,
      message,
      sourceEndpoint: SENDER,
    });

    expect(callsOf(fake.queries[0], "eq")).toEqual([["user_id", USER_ID]]);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [target, body, options] = sendNotification.mock.calls[0];
    expect(target).toEqual({ endpoint: PHONE, keys: { p256dh: "p256dh", auth: "auth" } });
    expect(JSON.parse(body)).toMatchObject({ type: "message", id: message.id, code: "731904" });
    expect(options).toMatchObject({
      urgency: "high",
      TTL: 600, // Codes expire quickly.
      vapidDetails: {
        publicKey: "public-key",
        privateKey: "private-key",
        subject: "mailto:owner@example.com",
      },
    });
  });

  it("deletes subscriptions the push service reports as gone", async () => {
    sendNotification.mockImplementation(async ({ endpoint }: { endpoint: string }) => {
      if (endpoint === OLD_TABLET) throw new WebPushError("Gone", 410);
      return { statusCode: 201 };
    });
    const fake = createFakeSupabase([
      { data: [subscription(PHONE), subscription(OLD_TABLET)] },
      { error: null },
    ]);

    await notifyNewMessage({ supabase: fake.client, userId: USER_ID, message });

    expect(fake.queries[1].table).toBe("push_subscriptions");
    expect(callsOf(fake.queries[1], "delete")).toHaveLength(1);
    expect(callsOf(fake.queries[1], "eq")).toEqual([["user_id", USER_ID]]);
    expect(callsOf(fake.queries[1], "in")).toEqual([["endpoint", [OLD_TABLET]]]);
  });

  it("logs other failures by status only, never the message", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendNotification.mockRejectedValue(new WebPushError("Your login code is 731904", 500));
    const fake = createFakeSupabase([{ data: [subscription(PHONE)] }]);

    await notifyNewMessage({ supabase: fake.client, userId: USER_ID, message });

    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).toContain("500");
    expect(logged).not.toContain("731904");
    expect(fake.queries).toHaveLength(1); // Not pruned: the device may recover.
  });
});
