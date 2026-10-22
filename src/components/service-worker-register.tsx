"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production builds. It only caches static assets and
 * an offline page; authenticated pages and message data are never cached.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // The app works without a service worker; nothing to do.
    });
  }, []);

  return null;
}
