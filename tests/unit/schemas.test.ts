// @vitest-environment node
import { describe, expect, it } from "vitest";

import { loginSchema } from "@/features/auth/schemas";
import {
  countCharacters,
  createMessageSchema,
  deleteMessageSchema,
  EMPTY_MESSAGE_ERROR,
  MESSAGE_TOO_LONG_ERROR,
  messageContentSchema,
} from "@/features/messages/schemas";

const CLIENT_ID = "6f1c1a52-8a52-4c2b-9a0e-4b7a0c1f2d3e";

describe("messageContentSchema", () => {
  it("rejects empty and whitespace-only messages", () => {
    for (const value of ["", " ", "\n\n", "\t \r\n"]) {
      const result = messageContentSchema.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(EMPTY_MESSAGE_ERROR);
    }
  });

  it("rejects non-string input", () => {
    expect(messageContentSchema.safeParse(undefined).success).toBe(false);
    expect(messageContentSchema.safeParse(42).success).toBe(false);
  });

  it("accepts exactly 10,000 characters and rejects 10,001", () => {
    expect(messageContentSchema.safeParse("x".repeat(10_000)).success).toBe(true);
    const tooLong = messageContentSchema.safeParse("x".repeat(10_001));
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0].message).toBe(MESSAGE_TOO_LONG_ERROR);
  });

  it("counts emoji as one character, matching Postgres char_length", () => {
    expect(countCharacters("😀")).toBe(1);
    expect(countCharacters("héllo 👋🏽")).toBe(8);
    expect(messageContentSchema.safeParse("😀".repeat(10_000)).success).toBe(true);
  });

  it("preserves content exactly: no trimming, newlines and Unicode intact", () => {
    const sms = "  Your OTP is 482913.\r\nValid for 5 min.\n\nمرحبا — 你好 ✅  ";
    expect(messageContentSchema.parse(sms)).toBe(sms);
  });
});

describe("createMessageSchema", () => {
  it("requires a UUID idempotency key", () => {
    expect(createMessageSchema.safeParse({ clientId: CLIENT_ID, content: "hi" }).success).toBe(
      true,
    );
    expect(createMessageSchema.safeParse({ clientId: "not-a-uuid", content: "hi" }).success).toBe(
      false,
    );
    expect(createMessageSchema.safeParse({ content: "hi" }).success).toBe(false);
  });

  it("strips unknown fields such as a forged user_id", () => {
    const parsed = createMessageSchema.parse({
      clientId: CLIENT_ID,
      content: "hi",
      user_id: "someone-else",
    });
    expect(parsed).toEqual({ clientId: CLIENT_ID, content: "hi" });
  });
});

describe("deleteMessageSchema", () => {
  it("only accepts UUIDs", () => {
    expect(deleteMessageSchema.safeParse({ id: CLIENT_ID }).success).toBe(true);
    expect(deleteMessageSchema.safeParse({ id: "1 or 1=1" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("trims the email and requires both fields", () => {
    expect(loginSchema.parse({ email: "  me@example.com ", password: "secret" }).email).toBe(
      "me@example.com",
    );
    expect(loginSchema.safeParse({ email: "", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "me@example.com", password: "" }).success).toBe(false);
  });
});
