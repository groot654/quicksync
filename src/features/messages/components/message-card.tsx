"use client";

import { ChevronDownIcon, Trash2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { selectElementText } from "@/lib/clipboard";
import { extractOtp } from "@/lib/otp";
import { formatAbsoluteTime, formatRelativeTime, formatTimeRemaining } from "@/lib/time";
import { cn } from "@/lib/utils";

import type { Message } from "../types";
import { CopyButton } from "./copy-button";
import { MessageText } from "./message-text";

type MessageCardProps = {
  message: Message;
  now: number | null;
  /** The newest message gets a prominent copy action. */
  featured?: boolean;
  /** Arrived after the list first rendered; animates in. */
  isNew?: boolean;
  onDelete: (message: Message) => void;
};

const LONG_MESSAGE_CHARS = 360;
const LONG_MESSAGE_LINES = 8;

export function MessageCard({
  message,
  now,
  featured = false,
  isNew = false,
  onDelete,
}: MessageCardProps) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const textId = useId();
  const [expanded, setExpanded] = useState(false);

  const isLong =
    message.content.length > LONG_MESSAGE_CHARS ||
    message.content.split("\n").length > LONG_MESSAGE_LINES;
  const otp = featured ? extractOtp(message.content) : null;

  const selectText = () => {
    setExpanded(true);
    if (textRef.current) selectElementText(textRef.current);
  };

  const deleteButton = (
    <ConfirmDialog
      title="Delete this message?"
      description="It will be removed from all your devices. This can't be undone."
      confirmLabel="Delete"
      onConfirm={() => onDelete(message)}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "size-10 shrink-0 rounded-xl text-muted-foreground hover:text-destructive",
            featured ? "-my-2 -mr-2 ml-auto" : "ml-auto",
          )}
        >
          <Trash2Icon className="size-[18px]" aria-hidden="true" />
          <span className="sr-only">Delete message</span>
        </Button>
      }
    />
  );

  return (
    <article
      aria-labelledby={textId}
      className={cn(
        "group/message rounded-2xl border bg-card text-card-foreground shadow-xs transition-shadow",
        featured ? "border-primary/25 p-4 shadow-sm ring-1 ring-primary/10 sm:p-5" : "p-4",
        isNew && "animate-in duration-300 fade-in-0 slide-in-from-top-2",
      )}
    >
      <header className="mb-2 flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
        {featured && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
            Latest
          </span>
        )}
        {now !== null && (
          <>
            <time dateTime={message.created_at} title={formatAbsoluteTime(message.created_at)}>
              {formatRelativeTime(message.created_at, now)}
            </time>
            <span aria-hidden="true">·</span>
            <span title={`Deletes automatically at ${formatAbsoluteTime(message.expires_at)}`}>
              {formatTimeRemaining(message.expires_at, now)}
            </span>
          </>
        )}
        {featured && deleteButton}
      </header>

      <MessageText
        ref={textRef}
        id={textId}
        content={message.content}
        className={cn(
          featured ? "text-[17px] leading-relaxed" : "text-[15px] leading-relaxed",
          isLong && !expanded && (featured ? "line-clamp-[10]" : "line-clamp-6"),
        )}
      />

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={textId}
          className="mt-1.5 inline-flex min-h-8 items-center gap-1 rounded-md text-sm font-medium text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDownIcon
            className={cn("size-4 transition-transform", expanded && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      )}

      <footer className={cn("mt-3 flex items-center gap-2", featured && "mt-4")}>
        {featured ? (
          <div className="grid flex-1 gap-2">
            <CopyButton
              text={message.content}
              label="Copy"
              onCopyFailed={selectText}
              className="h-12 w-full rounded-xl text-[15px] [&_svg]:size-[18px]"
            />
            {otp && (
              <CopyButton
                text={otp}
                variant="secondary"
                label={
                  <>
                    Copy code <span className="font-mono tracking-wider">{otp}</span>
                  </>
                }
                accessibleLabel={`Copy code ${otp}`}
                successMessage="Code copied"
                className="h-11 w-full rounded-xl text-[15px] [&_svg]:size-[18px]"
              />
            )}
          </div>
        ) : (
          <CopyButton
            text={message.content}
            label="Copy"
            variant="secondary"
            onCopyFailed={selectText}
            className="h-10 rounded-xl px-3.5"
          />
        )}

        {!featured && deleteButton}
      </footer>
    </article>
  );
}
