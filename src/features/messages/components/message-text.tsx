import { Fragment, type Ref } from "react";

import { cn } from "@/lib/utils";

const URL_PATTERN = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}])/g;

type MessageTextProps = {
  content: string;
  className?: string;
  id?: string;
  ref?: Ref<HTMLParagraphElement>;
};

/**
 * Renders message text exactly as sent (line breaks and spacing preserved) and turns
 * http(s) URLs into links. Content is rendered as text by React, never as HTML.
 */
export function MessageText({ content, className, id, ref }: MessageTextProps) {
  const parts = content.split(URL_PATTERN);

  return (
    <p
      ref={ref}
      id={id}
      className={cn(
        "[overflow-wrap:anywhere] break-words whitespace-pre-wrap select-text",
        className,
      )}
    >
      {parts.map((part, index) =>
        // split() with a capture group puts the matched URLs at odd indexes.
        index % 2 === 1 ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {part}
          </a>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
