"use client";

import { useSyncExternalStore } from "react";

/**
 * Per-device preference: copy one-time codes to the clipboard automatically, so the
 * keyboard's clipboard suggestion (Gboard, iOS "Paste") can fill them into the app or
 * site asking for them. Only "on"/"off" is stored, never message content.
 */
const STORAGE_KEY = "quicksync:auto-copy-codes";
const DEFAULT_ON = true;

const listeners = new Set<() => void>();

function read(): boolean {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === null ? DEFAULT_ON : value === "on";
  } catch {
    return DEFAULT_ON;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getAutoCopyCodes(): boolean {
  return typeof window === "undefined" ? DEFAULT_ON : read();
}

export function setAutoCopyCodes(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage unavailable (private mode); the setting lasts until the page closes.
  }
  listeners.forEach((listener) => listener());
}

export function useAutoCopyCodes(): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, read, () => DEFAULT_ON);
  return [enabled, setAutoCopyCodes];
}
