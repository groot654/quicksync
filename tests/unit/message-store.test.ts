// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  createInitialState,
  filterActive,
  mergeMessages,
  messagesReducer,
  type MessagesState,
} from "@/features/messages/message-store";
import type { Message } from "@/features/messages/types";

const BASE = Date.parse("2026-10-22T10:00:00.000Z");

function msg(minute: number, id = `m${minute}`, ttlHours = 24): Message {
  const created = BASE + minute * 60_000;
  return {
    id,
    content: `message ${id}`,
    created_at: new Date(created).toISOString(),
    expires_at: new Date(created + ttlHours * 3600_000).toISOString(),
  };
}

const ids = (state: MessagesState | Message[]) =>
  (Array.isArray(state) ? state : state.messages).map((message) => message.id);

describe("ordering and de-duplication", () => {
  it("sorts newest first", () => {
    expect(ids(createInitialState([msg(1), msg(3), msg(2)], false))).toEqual(["m3", "m2", "m1"]);
  });

  it("ignores a Realtime event for a message that is already shown", () => {
    const state = createInitialState([msg(2), msg(1)], false);
    const next = messagesReducer(state, { type: "upsert", messages: [msg(2)] });
    expect(ids(next)).toEqual(["m2", "m1"]);
  });

  it("merges the Server Action result and the Realtime echo into one item", () => {
    let state = createInitialState([msg(1)], false);
    state = messagesReducer(state, { type: "upsert", messages: [msg(5)] }); // From the action.
    state = messagesReducer(state, { type: "upsert", messages: [msg(5)] }); // Realtime echo.
    expect(ids(state)).toEqual(["m5", "m1"]);
  });

  it("orders messages with the same timestamp deterministically by id", () => {
    const merged = mergeMessages([msg(1, "a")], [msg(1, "b")]);
    expect(ids(merged)).toEqual(["b", "a"]);
  });
});

describe("deletions", () => {
  it("removes a message and keeps it from coming back via a stale refetch", () => {
    let state = createInitialState([msg(3), msg(2), msg(1)], false);
    state = messagesReducer(state, { type: "remove", ids: ["m2"] });
    expect(ids(state)).toEqual(["m3", "m1"]);

    // A refetch that started before the delete still contains m2.
    state = messagesReducer(state, {
      type: "reconcileLatest",
      messages: [msg(3), msg(2), msg(1)],
      hasMore: false,
    });
    expect(ids(state)).toEqual(["m3", "m1"]);

    state = messagesReducer(state, { type: "upsert", messages: [msg(2)] });
    expect(ids(state)).toEqual(["m3", "m1"]);
  });

  it("restores a message when an optimistic delete fails", () => {
    let state = createInitialState([msg(2), msg(1)], false);
    state = messagesReducer(state, { type: "remove", ids: ["m1"] });
    state = messagesReducer(state, { type: "restore", message: msg(1) });
    expect(ids(state)).toEqual(["m2", "m1"]);
  });

  it("clears everything", () => {
    let state = createInitialState([msg(2), msg(1)], true);
    state = messagesReducer(state, { type: "clear" });
    expect(state.messages).toEqual([]);
    expect(state.hasMore).toBe(false);
    // Late Realtime/refetch copies of cleared messages are ignored.
    state = messagesReducer(state, { type: "upsert", messages: [msg(1)] });
    expect(state.messages).toEqual([]);
  });
});

describe("reconcileLatest (refetch after reconnecting)", () => {
  it("adds messages missed while disconnected", () => {
    const state = createInitialState([msg(1)], false);
    const next = messagesReducer(state, {
      type: "reconcileLatest",
      messages: [msg(3), msg(2), msg(1)],
      hasMore: false,
    });
    expect(ids(next)).toEqual(["m3", "m2", "m1"]);
  });

  it("drops messages deleted on another device while disconnected", () => {
    const state = createInitialState([msg(3), msg(2), msg(1)], false);
    const next = messagesReducer(state, {
      type: "reconcileLatest",
      messages: [msg(3), msg(1)],
      hasMore: false,
    });
    expect(ids(next)).toEqual(["m3", "m1"]);
  });

  it("keeps messages that arrived via Realtime while the refetch was in flight", () => {
    const state = createInitialState([msg(9), msg(2)], false);
    const next = messagesReducer(state, {
      type: "reconcileLatest",
      messages: [msg(2)],
      hasMore: false,
    });
    expect(ids(next)).toEqual(["m9", "m2"]); // m9 is newer than the snapshot.

    const empty = messagesReducer(state, {
      type: "reconcileLatest",
      messages: [],
      hasMore: false,
      keepIds: ["m9"],
    });
    expect(ids(empty)).toEqual(["m9"]);
  });

  it("keeps older pages that were loaded with 'Load older'", () => {
    const state = createInitialState([msg(5), msg(4), msg(3), msg(2), msg(1)], true);
    const next = messagesReducer(state, {
      type: "reconcileLatest",
      messages: [msg(6), msg(5), msg(4)],
      hasMore: true,
    });
    expect(ids(next)).toEqual(["m6", "m5", "m4", "m3", "m2", "m1"]);
    expect(next.hasMore).toBe(true);
  });

  it("empties the list when the server has nothing left", () => {
    const state = createInitialState([msg(2), msg(1)], false);
    const next = messagesReducer(state, { type: "reconcileLatest", messages: [], hasMore: false });
    expect(next.messages).toEqual([]);
  });
});

describe("pagination", () => {
  it("appends older messages without duplicates and updates hasMore", () => {
    let state = createInitialState([msg(5), msg(4)], true);
    state = messagesReducer(state, {
      type: "appendOlder",
      messages: [msg(4), msg(3), msg(2)],
      hasMore: false,
    });
    expect(ids(state)).toEqual(["m5", "m4", "m3", "m2"]);
    expect(state.hasMore).toBe(false);
  });
});

describe("filterActive", () => {
  it("hides messages whose expiry has passed", () => {
    const fresh = msg(0, "fresh");
    const stale = msg(0, "stale", 1);
    const now = BASE + 2 * 3600_000;
    expect(ids(filterActive([fresh, stale], now))).toEqual(["fresh"]);
  });

  it("shows everything before the client clock is known (server render)", () => {
    expect(filterActive([msg(0, "a", -1)], null)).toHaveLength(1);
  });
});
