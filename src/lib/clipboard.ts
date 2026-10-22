/**
 * Copies text to the clipboard and reports whether it worked.
 *
 * Must be called synchronously from a user gesture (tap or click): iOS Safari rejects
 * clipboard writes that happen after an `await` or timer. The legacy `execCommand`
 * path covers older browsers and non-secure origins such as LAN testing over HTTP.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or not focused; fall through to the legacy path.
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  // Keep it out of view without display:none (which prevents selection). A 16px font
  // stops iOS from zooming the page.
  Object.assign(textarea.style, {
    position: "fixed",
    top: "0",
    left: "0",
    opacity: "0",
    pointerEvents: "none",
    fontSize: "16px",
  });

  document.body.appendChild(textarea);
  const previousFocus = document.activeElement as HTMLElement | null;

  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length); // Required on iOS.
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    previousFocus?.focus?.({ preventScroll: true });
  }
}

/** Selects an element's text so the user can copy it from the native menu. */
export function selectElementText(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}
