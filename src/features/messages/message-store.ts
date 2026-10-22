import type { Message } from "./types";

/**
 * Pure state management for the message list. Every source of messages (initial
 * render, Realtime events, refetches, pagination, local actions) goes through this
 * reducer, so de-duplication and ordering rules live in one place.
 */

export type MessagesState = {
  /** Newest first, unique by id. */
  messages: Message[];
  hasMore: boolean;
  /**
   * Ids deleted on this device or reported deleted by Realtime. A refetch that was
   * already in flight could otherwise bring a deleted message back.
   */
  tombstones: string[];
};

export type MessagesAction =
  | { type: "upsert"; messages: Message[] }
  | { type: "remove"; ids: string[] }
  | { type: "restore"; message: Message }
  | { type: "clear" }
  | { type: "reconcileLatest"; messages: Message[]; hasMore: boolean; keepIds?: string[] }
  | { type: "appendOlder"; messages: Message[]; hasMore: boolean };

const MAX_TOMBSTONES = 500;

export function createInitialState(messages: Message[], hasMore: boolean): MessagesState {
  return { messages: sortMessages(dedupe(messages)), hasMore, tombstones: [] };
}

/** Newest first; ties broken by id so the order is stable across devices. */
export function compareMessages(a: Message, b: Message): number {
  const byTime = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (byTime !== 0) return byTime;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort(compareMessages);
}

function dedupe(messages: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const message of messages) byId.set(message.id, message);
  return [...byId.values()];
}

export function mergeMessages(current: Message[], incoming: Message[], tombstones: string[] = []) {
  if (incoming.length === 0) return current;
  const deleted = new Set(tombstones);
  const fresh = incoming.filter((message) => !deleted.has(message.id));
  if (fresh.length === 0) return current;
  return sortMessages(dedupe([...current, ...fresh]));
}

function addTombstones(tombstones: string[], ids: string[]): string[] {
  const next = [...tombstones.filter((id) => !ids.includes(id)), ...ids];
  return next.length > MAX_TOMBSTONES ? next.slice(-MAX_TOMBSTONES) : next;
}

export function messagesReducer(state: MessagesState, action: MessagesAction): MessagesState {
  switch (action.type) {
    case "upsert": {
      const messages = mergeMessages(state.messages, action.messages, state.tombstones);
      return messages === state.messages ? state : { ...state, messages };
    }

    case "remove": {
      const ids = new Set(action.ids);
      return {
        ...state,
        messages: state.messages.filter((message) => !ids.has(message.id)),
        tombstones: addTombstones(state.tombstones, action.ids),
      };
    }

    case "restore": {
      // Undo an optimistic delete that the server rejected.
      const tombstones = state.tombstones.filter((id) => id !== action.message.id);
      return {
        ...state,
        tombstones,
        messages: mergeMessages(state.messages, [action.message], tombstones),
      };
    }

    case "clear":
      return {
        messages: [],
        hasMore: false,
        tombstones: addTombstones(
          state.tombstones,
          state.messages.map((message) => message.id),
        ),
      };

    case "reconcileLatest":
      return reconcileLatest(state, action.messages, action.hasMore, action.keepIds);

    case "appendOlder":
      return {
        ...state,
        messages: mergeMessages(state.messages, action.messages, state.tombstones),
        hasMore: action.hasMore,
      };
  }
}

/**
 * Applies a fresh snapshot of the newest page (fetched after reconnecting or returning
 * to the foreground), fixing anything missed while Realtime was disconnected.
 *
 * - Messages in the snapshot are added (duplicates are merged).
 * - Local messages inside the snapshot's time range but missing from it were deleted
 *   elsewhere, so they are removed.
 * - Local messages newer than the snapshot, or listed in `keepIds` (received while the
 *   request was in flight), are kept.
 * - Older pages loaded via "Load older" are kept if the snapshot was a full page.
 */
export function reconcileLatest(
  state: MessagesState,
  snapshot: Message[],
  snapshotHasMore: boolean,
  keepIds: string[] = [],
): MessagesState {
  const deleted = new Set(state.tombstones);
  const latest = sortMessages(dedupe(snapshot)).filter((message) => !deleted.has(message.id));
  const snapshotIds = new Set(snapshot.map((message) => message.id));
  const arrivedDuringFetch = new Set(keepIds);

  if (snapshot.length === 0) {
    // The server has nothing, apart from messages that arrived after the snapshot.
    return {
      ...state,
      messages: state.messages.filter((message) => arrivedDuringFetch.has(message.id)),
      hasMore: false,
    };
  }

  const sortedSnapshot = sortMessages(snapshot);
  const newest = sortedSnapshot[0];
  const oldest = sortedSnapshot[sortedSnapshot.length - 1];

  const kept = state.messages.filter((message) => {
    if (snapshotIds.has(message.id)) return false; // Replaced by the snapshot copy.
    if (arrivedDuringFetch.has(message.id)) return true;
    if (compareMessages(message, newest) < 0) return true; // Newer than the snapshot.
    if (compareMessages(message, oldest) > 0) return snapshotHasMore; // Older page.
    return false; // Inside the snapshot range but absent: deleted elsewhere.
  });

  const messages = sortMessages([...latest, ...kept]);
  const hasOlderLoaded = kept.some((message) => compareMessages(message, oldest) > 0);

  return {
    ...state,
    messages,
    // If older pages were already loaded, keep their pagination state.
    hasMore: hasOlderLoaded ? state.hasMore : snapshotHasMore,
  };
}

/** Messages that have not expired yet. Rows are physically deleted by the database. */
export function filterActive(messages: Message[], now: number | null): Message[] {
  if (now === null) return messages;
  return messages.filter((message) => Date.parse(message.expires_at) > now);
}
