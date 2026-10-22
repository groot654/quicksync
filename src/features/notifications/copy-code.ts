"use client";

import { toast } from "sonner";

import { copyText, copyTextWhenFocused } from "@/lib/clipboard";

type CopyOptions = {
  /** For example "Code 482913 copied". */
  successMessage: string;
  /** Label of the fallback button, for example "Copy code". */
  buttonLabel: string;
};

/**
 * Copies without a tap where the browser allows it (Chromium, once focused). Where it
 * doesn't (Safari), shows a toast with a button; tapping it is the gesture Safari needs.
 */
export async function copyOrOfferButton(
  text: string,
  { successMessage, buttonLabel }: CopyOptions,
) {
  if (await copyTextWhenFocused(text)) {
    toast.success(successMessage, {
      description: "Paste it wherever you need it.",
      duration: 2500,
    });
    return;
  }

  toast(buttonLabel, {
    description: "Tap to copy it to the clipboard.",
    duration: 20_000,
    action: {
      label: buttonLabel,
      // Synchronous inside the tap, as iOS requires.
      onClick: () =>
        void copyText(text).then((copied) => {
          if (copied) toast.success(successMessage, { duration: 2000 });
          else toast.error("Couldn't copy. Use the Copy button on the message instead.");
        }),
    },
  });
}
