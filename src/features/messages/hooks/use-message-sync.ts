"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { useOnlineStatus } from "@/hooks/use-online-status";
import { createId } from "@/lib/id";
import type { Database } from "@/types/database";

import { createInitialState, messagesReducer } from "../message-store";
import { fetchActiveMessages, realtimeTopicPrefix, toMessage } from "../queries";
import type { Message, MessagePage, SyncStatus } from "../types";

type ChannelStatus = Exclude<SyncStatus, "offline">;

/** Backoff for re-subscribing after a channel error: 1s, 2s, 4s … capped at 30s. */
const MAX_RETRY_DELAY_MS = 30_000;
/** After this long in the background, assume the socket is stale and reconnect. */
const STALE_AFTER_HIDDEN_MS = 10_000;

export type UseMessageSyncOptions = {
  /**
   * Returns the browser Supabase client. Called lazily from effects and handlers so the
   * client is never created during server rendering. Must be referentially stable.
   */
  getClient: () => SupabaseClient<Database>;
  userId: string;
  initialPage: MessagePage;
  /** The server-side load failed, so the initial (empty) page is not trustworthy. */
  initialLoadFailed?: boolean;
  /** Called when the session can no longer be used (signed out or expired). */
  onSessionExpired: () => void;
  /**
   * Called for each message that arrives live over Realtime (not for refetches), with
   * the idempotency key it was sent with, so the caller can tell its own sends apart.
   */
  onIncoming?: (message: Message, clientId: string | null) => void;
};

/**
 * Keeps the local message list in sync with the database.
 *
 * - Subscribes to Postgres Changes for the user's messages (RLS-filtered on the server).
 * - Reports the real channel state; "connected" only after the server confirms the
 *   change stream is live.
 * - Re-subscribes with exponential backoff after errors, on `online`, and when the app
 *   returns from the background, then refetches the newest page to fill any gap.
 * - All updates go through one reducer, which de-duplicates by id.
 */
export function useMessageSync({
  getClient,
  userId,
  initialPage,
  initialLoadFailed = false,
  onSessionExpired,
  onIncoming,
}: UseMessageSyncOptions) {
  const [state, dispatch] = useReducer(messagesReducer, initialPage, (page) =>
    createInitialState(page.messages, page.hasMore),
  );
  const [channelStatus, setChannelStatus] = useState<ChannelStatus>("connecting");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Only an initial load failure is surfaced; background refetch failures keep the
  // current list and retry on the next reconnect or foreground event.
  const [loadFailed, setLoadFailed] = useState(initialLoadFailed);
  const online = useOnlineStatus();

  // Ids received while a refetch is in flight, so the refetch result cannot drop them.
  const arrivalsRef = useRef<Set<string> | null>(null);
  const resyncIdRef = useRef(0);
  const onSessionExpiredRef = useRef(onSessionExpired);
  const onIncomingRef = useRef(onIncoming);

  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
    onIncomingRef.current = onIncoming;
  }, [onSessionExpired, onIncoming]);

  const addMessages = useCallback((messages: Message[]) => {
    messages.forEach((message) => arrivalsRef.current?.add(message.id));
    dispatch({ type: "upsert", messages });
  }, []);

  const removeMessages = useCallback((ids: string[]) => {
    dispatch({ type: "remove", ids });
  }, []);

  const restoreMessage = useCallback((message: Message) => {
    dispatch({ type: "restore", message });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: "clear" });
  }, []);

  /** Refetches the newest page and reconciles it with local state. Resolves to success. */
  const resync = useCallback(async (): Promise<boolean> => {
    const requestId = ++resyncIdRef.current;
    arrivalsRef.current = new Set();

    let result: Awaited<ReturnType<typeof fetchActiveMessages>>;
    try {
      result = await fetchActiveMessages(getClient(), { userId });
    } catch {
      result = { ok: false, code: "network" };
    }
    if (requestId !== resyncIdRef.current) return true; // Superseded by a newer refetch.

    const keepIds = [...(arrivalsRef.current ?? [])];
    arrivalsRef.current = null;
    if (!result.ok) return false; // Keep showing what we have; the next resync retries.

    dispatch({
      type: "reconcileLatest",
      messages: result.page.messages,
      hasMore: result.page.hasMore,
      keepIds,
    });
    setLoadFailed(false);
    return true;
  }, [getClient, userId]);

  const resyncRef = useRef(resync);
  useEffect(() => {
    resyncRef.current = resync;
  }, [resync]);

  // --- Realtime subscription lifecycle -------------------------------------------------
  useEffect(() => {
    const supabase = getClient();
    let disposed = false;
    let channel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let hasConnected = false;
    let hiddenAt: number | null = null;
    let connectGeneration = 0;

    const teardown = () => {
      const current = channel;
      channel = null;
      if (current) void supabase.removeChannel(current);
    };

    const scheduleReconnect = () => {
      if (disposed || retryTimer || !navigator.onLine) return;
      const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** attempt) + Math.random() * 500;
      attempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (disposed) return;
      const generation = ++connectGeneration;
      teardown();
      setChannelStatus(hasConnected ? "reconnecting" : "connecting");

      // Make sure the socket carries the current user's token before joining; without
      // it RLS would silently filter out every event.
      const { data } = await supabase.auth.getSession();
      if (disposed || generation !== connectGeneration) return;
      if (!data.session) {
        onSessionExpiredRef.current();
        return;
      }
      await supabase.realtime.setAuth(data.session.access_token);
      if (disposed || generation !== connectGeneration) return;

      // Private channel: joining is authorised by an RLS policy on realtime.messages that
      // only admits the topic owner. The suffix is unique per attempt because the client
      // reuses channels by topic and the previous one may still be closing.
      const next = supabase
        .channel(`${realtimeTopicPrefix(userId)}${createId()}`, {
          config: { private: true, postgres_changes_options: { wait: true } },
        })
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const message = toMessage(payload.new);
            if (!message) return;
            addMessages([message]);
            const clientId = (payload.new as { client_id?: unknown }).client_id;
            onIncomingRef.current?.(message, typeof clientId === "string" ? clientId : null);
          },
        )
        .on(
          // DELETE events cannot be filtered by column; with RLS they only carry the id.
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "messages" },
          (payload) => {
            const id = (payload.old as { id?: unknown } | null)?.id;
            if (typeof id === "string") removeMessages([id]);
          },
        );

      channel = next;
      next.subscribe((status) => {
        if (disposed || channel !== next) return; // Ignore events from replaced channels.

        if (status === "SUBSCRIBED") {
          attempt = 0;
          hasConnected = true;
          setChannelStatus("connected");
          // Fill anything that happened before the subscription was live.
          void resyncRef.current();
          return;
        }

        // CHANNEL_ERROR, TIMED_OUT or CLOSED: rebuild the channel with backoff.
        setChannelStatus(hasConnected ? "reconnecting" : "connecting");
        teardown();
        scheduleReconnect();
      });
    };

    const reconnectNow = () => {
      clearTimeout(retryTimer);
      retryTimer = undefined;
      attempt = 0;
      void connect();
    };

    const handleOnline = () => reconnectNow();

    const handleOffline = () => {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    };

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const hiddenFor = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (!navigator.onLine) return;

      // Mobile browsers suspend sockets in the background without always closing them.
      if (hiddenFor > STALE_AFTER_HIDDEN_MS || channel === null || channel.state !== "joined") {
        reconnectNow(); // Resyncs once subscribed.
      } else {
        void resyncRef.current();
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") onSessionExpiredRef.current();
    });

    void connect();
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      teardown();
      authListener.subscription.unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [getClient, userId, addMessages, removeMessages]);

  // --- Pagination ----------------------------------------------------------------------
  const isLoadingMoreRef = useRef(false);
  const loadMore = useCallback(async (): Promise<boolean> => {
    const oldest = state.messages.at(-1);
    if (isLoadingMoreRef.current || !state.hasMore || !oldest) return true;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const result = await fetchActiveMessages(getClient(), { userId, before: oldest });
      if (!result.ok) return false;
      dispatch({
        type: "appendOlder",
        messages: result.page.messages,
        hasMore: result.page.hasMore,
      });
      return true;
    } catch {
      return false;
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [state.messages, state.hasMore, getClient, userId]);

  return {
    messages: state.messages,
    hasMore: state.hasMore,
    isLoadingMore,
    loadFailed,
    status: (online ? channelStatus : "offline") as SyncStatus,
    addMessages,
    removeMessages,
    restoreMessage,
    clearAll,
    loadMore,
    resync,
  };
}
