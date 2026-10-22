import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMessageSync } from "@/features/messages/hooks/use-message-sync";
import type { Message } from "@/features/messages/types";

import { createFakeSupabase, type QueryResult } from "./fake-supabase";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function msg(id: string, minute: number): Message {
  const created = Date.parse("2030-01-01T10:00:00.000Z") + minute * 60_000;
  return {
    id,
    content: `content ${id}`,
    created_at: new Date(created).toISOString(),
    expires_at: new Date(created + 24 * 3600_000).toISOString(),
  };
}

type Handler = { filter: Record<string, string>; callback: (payload: unknown) => void };
type FakeChannel = {
  topic: string;
  options: { config?: Record<string, unknown> };
  handlers: Handler[];
  state: string;
  status?: (status: string) => void;
  emit: (event: "INSERT" | "DELETE", payload: unknown) => void;
};

function createFakeClient(fetchResults: QueryResult[] = []) {
  const channels: FakeChannel[] = [];
  const query = createFakeSupabase(fetchResults);
  let authCallback: ((event: string) => void) | undefined;

  const client = {
    from: query.from,
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "token" } } })),
      onAuthStateChange: vi.fn((callback: (event: string) => void) => {
        authCallback = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    realtime: { setAuth: vi.fn(async () => {}) },
    channel: vi.fn((topic: string, options: FakeChannel["options"]) => {
      const channel: FakeChannel = {
        topic,
        options,
        handlers: [],
        state: "joining",
        emit(event, payload) {
          this.handlers
            .filter((handler) => handler.filter.event === event)
            .forEach((handler) => handler.callback(payload));
        },
      };
      const api = {
        on: (_type: string, filter: Record<string, string>, callback: Handler["callback"]) => {
          channel.handlers.push({ filter, callback });
          return api;
        },
        subscribe: (callback: (status: string) => void) => {
          channel.status = (status) => {
            channel.state = status === "SUBSCRIBED" ? "joined" : "errored";
            callback(status);
          };
          return api;
        },
        get state() {
          return channel.state;
        },
        __fake: channel,
      };
      channels.push(channel);
      return api;
    }),
    removeChannel: vi.fn(async () => "ok"),
  };

  return {
    client: client as never,
    raw: client,
    channels,
    query,
    signOut: () => authCallback?.("SIGNED_OUT"),
  };
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}

function renderSync(fake: ReturnType<typeof createFakeClient>, initial: Message[] = []) {
  const onSessionExpired = vi.fn();
  const getClient = () => fake.client;
  const hook = renderHook(() =>
    useMessageSync({
      getClient,
      userId: USER_ID,
      initialPage: { messages: initial, hasMore: false },
      onSessionExpired,
    }),
  );
  return { ...hook, onSessionExpired };
}

const page = (...messages: Message[]): QueryResult => ({ data: messages });

beforeEach(() => setOnline(true));
afterEach(() => setOnline(true));

describe("useMessageSync", () => {
  it("subscribes to a private, user-scoped channel and only reports connected once confirmed", async () => {
    const fake = createFakeClient([page()]);
    const { result } = renderSync(fake);

    expect(result.current.status).toBe("connecting");
    await waitFor(() => expect(fake.channels).toHaveLength(1));

    const [channel] = fake.channels;
    expect(channel.topic.startsWith(`quicksync:${USER_ID}:`)).toBe(true);
    expect(channel.options.config).toMatchObject({
      private: true,
      postgres_changes_options: { wait: true },
    });
    expect(channel.handlers.find((h) => h.filter.event === "INSERT")?.filter.filter).toBe(
      `user_id=eq.${USER_ID}`,
    );
    expect(result.current.status).toBe("connecting");

    act(() => channel.status!("SUBSCRIBED"));
    expect(result.current.status).toBe("connected");
  });

  it("adds inserted messages once, even when the same event arrives twice", async () => {
    const fake = createFakeClient([page(msg("a", 1))]);
    const { result } = renderSync(fake, [msg("a", 1)]);
    await waitFor(() => expect(fake.channels).toHaveLength(1));
    act(() => fake.channels[0].status!("SUBSCRIBED"));

    act(() => {
      fake.channels[0].emit("INSERT", { new: msg("b", 2) });
      fake.channels[0].emit("INSERT", { new: msg("b", 2) });
    });

    expect(result.current.messages.map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("removes messages deleted on another device", async () => {
    const fake = createFakeClient([page(msg("b", 2), msg("a", 1))]);
    const { result } = renderSync(fake, [msg("b", 2), msg("a", 1)]);
    await waitFor(() => expect(fake.channels).toHaveLength(1));

    act(() => fake.channels[0].emit("DELETE", { old: { id: "a" } }));
    expect(result.current.messages.map((m) => m.id)).toEqual(["b"]);
  });

  it("ignores malformed Realtime payloads", async () => {
    const fake = createFakeClient();
    const { result } = renderSync(fake);
    await waitFor(() => expect(fake.channels).toHaveLength(1));

    act(() => fake.channels[0].emit("INSERT", { new: {} }));
    expect(result.current.messages).toEqual([]);
  });

  it("shows reconnecting after a channel error, then resubscribes and refetches missed messages", async () => {
    const fake = createFakeClient([page(msg("a", 1)), page(msg("c", 3), msg("a", 1))]);
    const { result } = renderSync(fake, [msg("a", 1)]);
    await waitFor(() => expect(fake.channels).toHaveLength(1));
    act(() => fake.channels[0].status!("SUBSCRIBED"));
    await waitFor(() => expect(fake.query.from).toHaveBeenCalledTimes(1));

    act(() => fake.channels[0].status!("CHANNEL_ERROR"));
    expect(result.current.status).toBe("reconnecting");
    expect(fake.raw.removeChannel).toHaveBeenCalled();

    // Backoff retry creates a fresh channel.
    await waitFor(() => expect(fake.channels).toHaveLength(2), { timeout: 3000 });
    act(() => fake.channels[1].status!("SUBSCRIBED"));

    expect(result.current.status).toBe("connected");
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(["c", "a"]));
  });

  it("reports offline from the browser and reconnects when back online", async () => {
    const fake = createFakeClient([page(), page()]);
    const { result } = renderSync(fake);
    await waitFor(() => expect(fake.channels).toHaveLength(1));
    act(() => fake.channels[0].status!("SUBSCRIBED"));

    act(() => setOnline(false));
    expect(result.current.status).toBe("offline");

    act(() => setOnline(true));
    await waitFor(() => expect(fake.channels).toHaveLength(2));
    expect(result.current.status).toBe("reconnecting");
  });

  it("refetches when the app returns to the foreground", async () => {
    const fake = createFakeClient([page(), page(msg("new", 5))]);
    const { result } = renderSync(fake);
    await waitFor(() => expect(fake.channels).toHaveLength(1));
    act(() => fake.channels[0].status!("SUBSCRIBED"));
    await waitFor(() => expect(fake.query.from).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(["new"]));
  });

  it("reports an expired session", async () => {
    const fake = createFakeClient();
    const { onSessionExpired } = renderSync(fake);
    await waitFor(() => expect(fake.channels).toHaveLength(1));

    act(() => fake.signOut());
    expect(onSessionExpired).toHaveBeenCalled();
  });

  it("unsubscribes on unmount", async () => {
    const fake = createFakeClient();
    const { unmount } = renderSync(fake);
    await waitFor(() => expect(fake.channels).toHaveLength(1));

    unmount();
    expect(fake.raw.removeChannel).toHaveBeenCalledTimes(1);
  });
});
