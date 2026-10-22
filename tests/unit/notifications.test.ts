// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_MESSAGE_TYPE,
  parseNotificationMessage,
  parseNotificationUrl,
} from "@/features/notifications/notification-intent";
import {
  buildMessagePushPayload,
  formatCode,
  PUSH_PREVIEW_CHARS,
  truncatePreview,
} from "@/features/notifications/payload";
import {
  isAllowedPushEndpoint,
  savePushSubscriptionSchema,
} from "@/features/notifications/schemas";

const MESSAGE_ID = "9d7a4f3e-2b1c-4d5e-8f6a-7b8c9d0e1f2a";

const message = (content: string) => ({
  id: MESSAGE_ID,
  content,
  created_at: "2026-10-22T10:00:00.000Z",
  expires_at: "2026-10-23T10:00:00.000Z",
});

describe("buildMessagePushPayload", () => {
  it("puts a detected one-time code in the title and payload", () => {
    const payload = buildMessagePushPayload(message("Your verification code is 482913."));
    expect(payload).toEqual({
      type: "message",
      id: MESSAGE_ID,
      title: "Code 482 913",
      body: "Your verification code is 482913.",
      code: "482913",
      createdAt: "2026-10-22T10:00:00.000Z",
    });
  });

  it("uses a plain title for ordinary messages", () => {
    const payload = buildMessagePushPayload(message("https://example.com/some/link"));
    expect(payload.title).toBe("New message");
    expect(payload.code).toBeNull();
  });

  it("keeps long messages within the push size budget", () => {
    const payload = buildMessagePushPayload(message("x".repeat(9_000)));
    expect(Array.from(payload.body)).toHaveLength(PUSH_PREVIEW_CHARS);
    expect(payload.body.endsWith("…")).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThan(3_000);
  });
});

describe("truncatePreview", () => {
  it("never splits an emoji", () => {
    const preview = truncatePreview("😀".repeat(10), 5);
    expect(preview).toBe("😀😀😀😀…");
  });

  it("leaves short text alone", () => {
    expect(truncatePreview("  hello  ")).toBe("hello");
  });
});

describe("formatCode", () => {
  it("groups 6- and 8-digit codes and leaves others alone", () => {
    expect(formatCode("123456")).toBe("123 456");
    expect(formatCode("12345678")).toBe("1234 5678");
    expect(formatCode("12345")).toBe("12345");
  });
});

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://web.push.apple.com/QGxyz",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-db5p.notify.windows.com/w/?token=abc",
  ])("accepts the push service %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://localhost/push",
    "https://169.254.169.254/latest/meta-data",
    "https://evil-googleapis.com/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://fcm.googleapis.com:8443/x",
    "https://user:pass@fcm.googleapis.com/x",
    "not a url",
  ])("refuses %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});

describe("savePushSubscriptionSchema", () => {
  const valid = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    keys: {
      p256dh:
        "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
      auth: "tBHItJI5svbpez7KI4CCXg",
    },
  };

  it("accepts a real subscription", () => {
    expect(savePushSubscriptionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects keys that aren't base64url", () => {
    const bad = { ...valid, keys: { ...valid.keys, auth: "not base64!" } };
    expect(savePushSubscriptionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("notification intents", () => {
  it("reads an intent posted by the service worker", () => {
    expect(
      parseNotificationMessage({
        type: NOTIFICATION_MESSAGE_TYPE,
        action: "copy-code",
        messageId: MESSAGE_ID,
      }),
    ).toEqual({ action: "copy-code", messageId: MESSAGE_ID });
  });

  it("ignores unrelated or malformed messages", () => {
    expect(
      parseNotificationMessage({ type: "other", action: "copy", messageId: MESSAGE_ID }),
    ).toBeNull();
    expect(
      parseNotificationMessage({
        type: NOTIFICATION_MESSAGE_TYPE,
        action: "delete",
        messageId: MESSAGE_ID,
      }),
    ).toBeNull();
    expect(parseNotificationMessage(null)).toBeNull();
  });

  it("reads an intent from the URL the service worker opened", () => {
    expect(parseNotificationUrl(`?notification=copy&message=${MESSAGE_ID}`)).toEqual({
      action: "copy",
      messageId: MESSAGE_ID,
    });
    expect(parseNotificationUrl("?notification=copy&message=../../etc")).toBeNull();
    expect(parseNotificationUrl("")).toBeNull();
  });
});
