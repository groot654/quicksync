/** Browser-only platform checks. Call them from effects, handlers or external stores. */

export function isIos(): boolean {
  const { userAgent, maxTouchPoints } = navigator;
  // iPadOS reports a desktop Mac user agent but has touch.
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** Running as an installed app (home screen / app window) rather than in a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
