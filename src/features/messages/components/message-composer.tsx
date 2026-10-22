"use client";

import {
  ClipboardPasteIcon,
  LoaderCircleIcon,
  SendHorizontalIcon,
  WifiOffIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createId } from "@/lib/id";
import { cn } from "@/lib/utils";

import { createMessage } from "../actions";
import { CHARACTER_COUNT_THRESHOLD, MAX_MESSAGE_LENGTH } from "../constants";
import { countCharacters, messageContentSchema } from "../schemas";
import type { Message } from "../types";

const subscribeNever = () => () => {};
const canReadClipboard = () => typeof navigator.clipboard?.readText === "function";

type MessageComposerProps = {
  online: boolean;
  onSent: (message: Message) => void;
  onUnauthorized: () => void;
};

export function MessageComposer({ online, onSent, onUnauthorized }: MessageComposerProps) {
  // The draft lives only in component memory: never in localStorage or sessionStorage.
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  // Feature-detected on the client only, so server and client markup match.
  const canPaste = useSyncExternalStore(subscribeNever, canReadClipboard, () => false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);
  /**
   * Idempotency key for the current draft. Retrying the same text reuses it, so a
   * retry after a lost response can't create a duplicate. Editing the text resets it.
   */
  const clientIdRef = useRef<string | null>(null);

  const inputId = useId();
  const errorId = useId();
  const countId = useId();

  const characters = countCharacters(draft);
  const showCount = characters >= CHARACTER_COUNT_THRESHOLD;
  const overLimit = characters > MAX_MESSAGE_LENGTH;
  const isBlank = draft.trim().length === 0;

  const updateDraft = (value: string) => {
    setDraft(value);
    clientIdRef.current = null;
    if (error) setError(null);
  };

  const send = async () => {
    if (sendingRef.current) return; // Ignore double taps while a send is in flight.

    const parsed = messageContentSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      textareaRef.current?.focus();
      return;
    }
    if (!navigator.onLine) {
      toast.error("You're offline", {
        description: "Your text is kept here. Send it once you're back online.",
      });
      return;
    }

    sendingRef.current = true;
    setIsSending(true);
    clientIdRef.current ??= createId();
    const content = parsed.data;

    try {
      const result = await createMessage({ clientId: clientIdRef.current, content });

      if (result.ok) {
        onSent(result.data);
        setDraft("");
        clientIdRef.current = null;
        toast.success("Sent to your devices", { duration: 1500 });
        return;
      }

      if (result.error.code === "UNAUTHORIZED") {
        toast.error(result.error.message);
        onUnauthorized();
        return;
      }

      if (result.error.code === "VALIDATION") {
        setError(result.error.message);
        return;
      }

      toast.error(result.error.message, {
        action: { label: "Retry", onClick: () => void sendRef.current() },
      });
    } catch {
      // The request never reached the server, or the response was lost.
      toast.error("Couldn't reach QuickSync", {
        description: "Check your connection. Your text is still here.",
        action: { label: "Retry", onClick: () => void sendRef.current() },
      });
    } finally {
      sendingRef.current = false;
      setIsSending(false);
    }
  };

  // Lets the toast's Retry button call the latest `send` with the current draft.
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter sends; plain Enter inserts a new line.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void send();
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast.info("Your clipboard is empty");
        return;
      }
      const textarea = textareaRef.current;
      const start = textarea?.selectionStart ?? draft.length;
      const end = textarea?.selectionEnd ?? draft.length;
      updateDraft(draft.slice(0, start) + text + draft.slice(end));
      requestAnimationFrame(() => {
        textarea?.focus();
        textarea?.setSelectionRange(start + text.length, start + text.length);
      });
    } catch {
      toast.error("Couldn't read the clipboard", {
        description: "Press and hold in the text box, then choose Paste.",
      });
    }
  };

  const describedBy = [error ? errorId : null, showCount ? countId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <form onSubmit={handleSubmit} aria-label="Send a message" className="relative">
      <div
        className={cn(
          "rounded-2xl border bg-card shadow-sm transition-[border-color,box-shadow]",
          "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
          (error || overLimit) &&
            "border-destructive focus-within:border-destructive focus-within:ring-destructive/20",
        )}
      >
        <Label htmlFor={inputId} className="sr-only">
          Message
        </Label>
        <Textarea
          ref={textareaRef}
          id={inputId}
          name="content"
          value={draft}
          onChange={(event) => updateDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste something to sync..."
          aria-invalid={Boolean(error) || overLimit || undefined}
          aria-describedby={describedBy || undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          spellCheck={false}
          enterKeyHint="enter"
          rows={4}
          className="max-h-[45dvh] min-h-32 resize-none rounded-2xl border-0 bg-transparent px-4 pt-4 pb-2 text-base leading-relaxed shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent"
        />

        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          {canPaste && (
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-xl px-3 text-muted-foreground"
              onClick={() => void handlePaste()}
            >
              <ClipboardPasteIcon className="size-[18px]" aria-hidden="true" />
              Paste
            </Button>
          )}

          {showCount && (
            <span
              id={countId}
              aria-live="polite"
              className={cn(
                "text-xs tabular-nums",
                overLimit ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              {characters.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}
            </span>
          )}

          <Button
            type="submit"
            disabled={isSending || !online || isBlank || overLimit}
            aria-busy={isSending || undefined}
            className="ml-auto h-11 min-w-28 rounded-xl px-5 text-[15px] shadow-sm"
          >
            {isSending ? (
              <>
                <LoaderCircleIcon className="size-[18px] animate-spin" aria-hidden="true" />
                Sending…
              </>
            ) : !online ? (
              <>
                <WifiOffIcon className="size-[18px]" aria-hidden="true" />
                Offline
              </>
            ) : (
              <>
                Send
                <SendHorizontalIcon className="size-[18px]" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-2 px-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
