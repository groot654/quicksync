// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createId } from "@/lib/id";
import { extractOtp } from "@/lib/otp";

describe("extractOtp", () => {
  it.each([
    ["Your verification code is 482913. Do not share it.", "482913"],
    ["G-731942 is your Google verification code.", "731942"],
    ["Use 1234 as your login PIN", "1234"],
    ["Your OTP: 123 456", "123456"],
    ["Bank: one-time password 90817263 valid 5 min", "90817263"],
  ])("finds the code in %j", (sms, code) => {
    expect(extractOtp(sms)).toBe(code);
  });

  it.each([
    "Your order of 2500 items has shipped",
    "Meet me at 1430 near gate 12",
    "Call me back on 03001234567",
    "Your code expires in 2025",
    "https://example.com/reset?code=abcdef",
  ])("ignores messages without a code: %j", (text) => {
    expect(extractOtp(text)).toBeNull();
  });
});

describe("createId", () => {
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("returns unique v4 UUIDs", () => {
    const values = new Set(Array.from({ length: 200 }, createId));
    expect(values.size).toBe(200);
    values.forEach((value) => expect(value).toMatch(UUID_V4));
  });

  it("works without crypto.randomUUID (plain-HTTP LAN testing)", () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    try {
      expect(createId()).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});
