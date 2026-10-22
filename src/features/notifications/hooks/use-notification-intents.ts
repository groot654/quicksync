"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import type { Message } from "@/features/messages/types";
import { extractOtp } from "@/lib/otp";

import { getAutoCopyCodes } from "../auto-copy";
import { closeDeliveredNotifications } from "../client";
import { copyOrOfferButton } from "../copy-code";
import {
  NOTIFICATION_URL_PARAMS,
  parseNotificationMessage,
  parseNotificationUrl,
  type NotificationIntent,
} from "../notification-intent";

/** Long enough for a backgrounded app to reconnect and fetch the message. */
const FIND_MESSAGE_TIMEOUT_MS = 15_000;

/**
 * Carries out what the user picked on a notification ("Copy code", "Copy message" or a
 * plain tap). The intent arrives from the service worker, as URL parameters when it
 * opened a new window or as a message to a window that was already open.
 *
 * The message may not be in the list yet (the app was asleep and is still resyncing),
 * so the intent waits until it appears.
 */
export function useNotificationIntents(messages: Message[]) {
  const messagesRef = useRef(messages);
  const pendingRef = useRef<NotificationIntent | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const runPendingRef = useRef(() => {
    const intent = pendingRef.current;
    if (!intent) return;
    const message = messagesRef.current.find((candidate) => candidate.id === intent.messageId);
    if (!message) return;

    pendingRef.current = null;
    clearTimeout(timeoutRef.current);
    void runIntent(intent, message);
  });

  useEffect(() => {
    messagesRef.current = messages;
    runPendingRef.current();
  }, [messages]);

  useEffect(() => {
    const accept = (intent: NotificationIntent) => {
      pendingRef.current = intent;
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (pendingRef.current !== intent) return;
        pendingRef.current = null;
        if (intent.action !== "open") {
          toast.error("That message is no longer available.", {
            description: "It may have been deleted or expired.",
          });
        }
      }, FIND_MESSAGE_TIMEOUT_MS);
      runPendingRef.current();
    };

    // Opened from a notification: take the intent and tidy the URL.
    const fromUrl = parseNotificationUrl(window.location.search);
    if (fromUrl) {
      const url = new URL(window.location.href);
      url.searchParams.delete(NOTIFICATION_URL_PARAMS.action);
      url.searchParams.delete(NOTIFICATION_URL_PARAMS.message);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      accept(fromUrl);
    }

    const container = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    const onMessage = (event: MessageEvent) => {
      const intent = parseNotificationMessage(event.data);
      if (intent) accept(intent);
    };
    container?.addEventListener("message", onMessage);
    container?.startMessages();

    // Notifications already on screen are stale once the app shows the messages.
    const onVisible = () => {
      if (document.visibilityState === "visible") void closeDeliveredNotifications();
    };
    onVisible();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timeoutRef.current);
      container?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}

async function runIntent(intent: NotificationIntent, message: Message) {
  const code = extractOtp(message.content);

  if (intent.action === "copy") {
    await copyOrOfferButton(message.content, {
      successMessage: "Message copied",
      buttonLabel: "Copy message",
    });
    return;
  }

  // "Copy code" always copies; a plain tap copies only with auto-copy on.
  if (code && (intent.action === "copy-code" || getAutoCopyCodes())) {
    await copyOrOfferButton(code, {
      successMessage: `Code ${code} copied`,
      buttonLabel: "Copy code",
    });
  }
}
