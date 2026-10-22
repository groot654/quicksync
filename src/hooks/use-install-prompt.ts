"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { isIos, isStandalone } from "@/lib/platform";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallMode = "prompt" | "ios-instructions" | "installed" | "unavailable";

function subscribeDisplayMode(onChange: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Install support: Chromium fires `beforeinstallprompt`, which we keep to trigger later.
 * iOS has no install API, so we show "Add to Home Screen" instructions instead.
 */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const standalone = useSyncExternalStore(subscribeDisplayMode, isStandalone, () => false);
  const ios = useSyncExternalStore(
    () => () => {},
    isIos,
    () => false,
  );

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const mode: InstallMode = standalone
    ? "installed"
    : deferred
      ? "prompt"
      : ios
        ? "ios-instructions"
        : "unavailable";

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome === "accepted";
  }, [deferred]);

  return { mode, promptInstall };
}
