"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";

import type { Message } from "@/features/messages/types";
import { copyText } from "@/lib/clipboard";
import { extractOtp } from "@/lib/otp";

import { getAutoCopyCodes } from "../auto-copy";

/**
 * Copies a one-time code the moment it arrives from another device while QuickSync is
 * open and focused, so it is ready to paste (or for the keyboard to suggest) in the app
 * asking for it. Messages sent from this device are ignored.
 *
 * Works where the browser allows clipboard writes without a tap (Chromium). Elsewhere
 * the copy quietly fails and the message's own "Copy code" button is still there.
 */
export function useCodeAutoCopy() {
  const sentHere = useRef(new Set<string>());

  /** Call with each message's idempotency key before sending it. */
  const markSent = useCallback((clientId: string) => {
    sentHere.current.add(clientId);
  }, []);

  const handleIncoming = useCallback((message: Message, clientId: string | null) => {
    if (clientId && sentHere.current.has(clientId)) return;
    if (!getAutoCopyCodes()) return;
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;

    const code = extractOtp(message.content);
    if (!code) return;

    void copyText(code).then((copied) => {
      if (copied) {
        toast.success(`Code ${code} copied`, {
          description: "Paste it wherever you need it.",
          duration: 2500,
        });
      }
    });
  }, []);

  return { markSent, handleIncoming };
}
