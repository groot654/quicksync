"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

type CopyButtonProps = Omit<ComponentProps<typeof Button>, "onClick" | "children"> & {
  text: string;
  /** Visible label. When omitted the button is icon-only and uses `accessibleLabel`. */
  label?: ReactNode;
  accessibleLabel?: string;
  successMessage?: string;
  /** Called when the browser refuses clipboard access, e.g. to select the text instead. */
  onCopyFailed?: () => void;
};

const RESET_AFTER_MS = 2000;

export function CopyButton({
  text,
  label,
  accessibleLabel = "Copy message",
  successMessage = "Copied to clipboard",
  onCopyFailed,
  className,
  ...buttonProps
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleClick = () => {
    // copyText starts the clipboard write synchronously, inside this tap, which iOS
    // Safari requires.
    void copyText(text).then((success) => {
      if (success) {
        setCopied(true);
        toast.success(successMessage, { duration: 1500 });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), RESET_AFTER_MS);
      } else {
        onCopyFailed?.();
        toast.error("Couldn't copy automatically", {
          description: "Your browser blocked clipboard access. Press and hold the text to copy it.",
        });
      }
    });
  };

  const Icon = copied ? CheckIcon : CopyIcon;

  return (
    <Button
      type="button"
      onClick={handleClick}
      data-copied={copied || undefined}
      className={cn("transition-colors", className)}
      {...buttonProps}
    >
      <Icon className={cn(copied && "text-success")} aria-hidden="true" />
      {label ? (
        <span>{copied ? "Copied" : label}</span>
      ) : (
        <span className="sr-only">{copied ? "Copied" : accessibleLabel}</span>
      )}
    </Button>
  );
}
