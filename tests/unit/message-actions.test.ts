// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callsOf, createFakeSupabase, type QueryResult } from "./fake-supabase";

const getAuthContext = vi.fn();
vi.mock("@/features/auth/dal", () => ({ getAuthContext: () => getAuthContext() }));

// `after()` needs a request scope; collect the callbacks so tests can run them.
const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", () => ({
  after: (callback: () => unknown) => afterCallbacks.push(callback),
}));

const notifyNewMessage = vi.fn();
vi.mock("@/features/notifications/send", () => ({
  notifyNewMessage: (options: unknown) => notifyNewMessage(options),
}));

const { clearMessages, createMessage, deleteMessage } = await import("@/features/messages/actions");

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "me@example.com" };
const CLIENT_ID = "6f1c1a52-8a52-4c2b-9a0e-4b7a0c1f2d3e";
const MESSAGE_ID = "9d7a4f3e-2b1c-4d5e-8f6a-7b8c9d0e1f2a";

const storedMessage = {
  id: MESSAGE_ID,
  content: "Your code is 123456",
  created_at: "2026-10-22T10:00:00.000Z",
  expires_at: "2026-10-23T10:00:00.000Z",
};

function signedIn(results: QueryResult[]) {
  const fake = createFakeSupabase(results);
  getAuthContext.mockResolvedValue({ supabase: fake.client, user: USER });
  return fake;
}

beforeEach(() => {
  getAuthContext.mockReset();
  notifyNewMessage.mockReset();
  afterCallbacks.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createMessage", () => {
  it("refuses unauthenticated callers without touching the database", async () => {
    getAuthContext.mockResolvedValue(null);
    const result = await createMessage({ clientId: CLIENT_ID, content: "hi" });
    expect(result).toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED", message: expect.any(String) },
    });
  });

  it("rejects empty messages", async () => {
    const fake = signedIn([]);
    const result = await createMessage({ clientId: CLIENT_ID, content: "   \n" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("VALIDATION");
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("rejects messages over 10,000 characters", async () => {
    const fake = signedIn([]);
    const result = await createMessage({ clientId: CLIENT_ID, content: "a".repeat(10_001) });
    expect(!result.ok && result.error.code).toBe("VALIDATION");
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("stores the message under the verified user's id, ignoring any client-supplied owner", async () => {
    const fake = signedIn([{ data: storedMessage }]);
    const result = await createMessage({
      clientId: CLIENT_ID,
      content: storedMessage.content,
      user_id: "22222222-2222-4222-8222-222222222222",
    });

    expect(result).toEqual({ ok: true, data: storedMessage });
    const [insert] = callsOf(fake.queries[0], "insert");
    expect(insert[0]).toEqual({
      user_id: USER.id,
      client_id: CLIENT_ID,
      content: storedMessage.content,
    });
  });

  it("notifies the user's other devices after responding, excluding the sender", async () => {
    const fake = signedIn([{ data: storedMessage }]);
    const sourceEndpoint = "https://fcm.googleapis.com/fcm/send/this-device";
    await createMessage({ clientId: CLIENT_ID, content: storedMessage.content, sourceEndpoint });

    expect(notifyNewMessage).not.toHaveBeenCalled(); // Not before the response.
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(notifyNewMessage).toHaveBeenCalledWith({
      supabase: fake.client,
      userId: USER.id,
      message: storedMessage,
      sourceEndpoint,
    });
  });

  it("ignores a malformed source endpoint instead of rejecting the message", async () => {
    signedIn([{ data: storedMessage }]);
    const result = await createMessage({
      clientId: CLIENT_ID,
      content: storedMessage.content,
      sourceEndpoint: 42,
    });
    expect(result.ok).toBe(true);
  });

  it("returns the original message when a retry hits the idempotency key", async () => {
    const fake = signedIn([{ error: { code: "23505" } }, { data: storedMessage }]);
    const result = await createMessage({ clientId: CLIENT_ID, content: storedMessage.content });

    expect(result).toEqual({ ok: true, data: storedMessage });
    // The first attempt already notified; a retry must not notify again.
    expect(afterCallbacks).toHaveLength(0);
    expect(fake.queries).toHaveLength(2);
    expect(callsOf(fake.queries[1], "eq")).toEqual([
      ["user_id", USER.id],
      ["client_id", CLIENT_ID],
    ]);
  });

  it("returns a safe error and does not log message content on database failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    signedIn([{ error: { code: "XX000", message: "Failing row contains (secret 999999)" } }]);

    const result = await createMessage({ clientId: CLIENT_ID, content: "secret 999999" });

    expect(result).toEqual({
      ok: false,
      error: { code: "SERVER", message: "Couldn't send your message. Please try again." },
    });
    const logged = errorSpy.mock.calls.flat().join(" ");
    expect(logged).toContain("XX000");
    expect(logged).not.toContain("999999");
  });
});

describe("deleteMessage", () => {
  it("refuses unauthenticated callers", async () => {
    getAuthContext.mockResolvedValue(null);
    const result = await deleteMessage({ id: MESSAGE_ID });
    expect(!result.ok && result.error.code).toBe("UNAUTHORIZED");
  });

  it("validates the id", async () => {
    const fake = signedIn([]);
    const result = await deleteMessage({ id: "1; drop table messages" });
    expect(!result.ok && result.error.code).toBe("VALIDATION");
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("scopes the delete to the signed-in owner", async () => {
    const fake = signedIn([{ error: null }]);
    const result = await deleteMessage({ id: MESSAGE_ID });

    expect(result).toEqual({ ok: true, data: { id: MESSAGE_ID } });
    expect(callsOf(fake.queries[0], "eq")).toEqual([
      ["id", MESSAGE_ID],
      ["user_id", USER.id],
    ]);
  });

  it("reports database failures safely", async () => {
    signedIn([{ error: { code: "57014" } }]);
    const result = await deleteMessage({ id: MESSAGE_ID });
    expect(!result.ok && result.error.code).toBe("SERVER");
  });
});

describe("clearMessages", () => {
  it("refuses unauthenticated callers", async () => {
    getAuthContext.mockResolvedValue(null);
    expect((await clearMessages()).ok).toBe(false);
  });

  it("deletes only the signed-in user's messages and returns the count", async () => {
    const fake = signedIn([{ error: null, count: 4 }]);
    const result = await clearMessages();

    expect(result).toEqual({ ok: true, data: { deleted: 4 } });
    expect(callsOf(fake.queries[0], "eq")).toEqual([["user_id", USER.id]]);
  });
});
