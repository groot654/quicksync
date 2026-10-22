"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function emit() {
  now = Date.now();
  listeners.forEach((listener) => listener());
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    now = Date.now();
    timer = setInterval(emit, TICK_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

/**
 * The current time, refreshed every 30 seconds and whenever the app returns to the
 * foreground. Returns `null` during server rendering and hydration, so time-dependent
 * text (relative times, the viewer's time zone) only renders in the browser and never
 * causes a hydration mismatch.
 */
export function useNow(): number | null {
  return useSyncExternalStore<number | null>(
    subscribe,
    () => now,
    () => null,
  );
}
