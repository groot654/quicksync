"use client";

import { AlertCircleIcon, LoaderCircleIcon, RotateCwIcon, Trash2Icon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { AppHeader } from "@/components/app-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/features/auth/components/account-menu";
import { NotificationPrompt } from "@/features/notifications/components/notification-prompt";
import { useCodeAutoCopy } from "@/features/notifications/hooks/use-code-auto-copy";
import { useNotificationIntents } from "@/features/notifications/hooks/use-notification-intents";
import { useNow } from "@/hooks/use-now";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { createClient } from "@/lib/supabase/client";

import { clearMessages, deleteMessage } from "../actions";
import { useMessageSync } from "../hooks/use-message-sync";
import { filterActive } from "../message-store";
import type { Message, MessagePage } from "../types";
import { ConnectionStatus } from "./connection-status";
import { EmptyState } from "./empty-state";
import { MessageCard } from "./message-card";
import { MessageComposer } from "./message-composer";

type MessagesAppProps = {
  user: { id: string; email: string | null };
  initialPage: MessagePage;
  /** The server could not load messages; show a retry banner instead of a false empty state. */
  initialLoadFailed: boolean;
};

export function MessagesApp({ user, initialPage, initialLoadFailed }: MessagesAppProps) {
  const online = useOnlineStatus();
  const now = useNow();
  const [isRetrying, setIsRetrying] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Only messages that arrive after the first render animate in.
  const [initialIds] = useState(() => new Set(initialPage.messages.map((message) => message.id)));
  const sessionExpiredRef = useRef(false);

  const handleSessionExpired = useCallback(() => {
    if (sessionExpiredRef.current) return;
    sessionExpiredRef.current = true;
    window.location.replace("/login");
  }, []);

  const autoCopy = useCodeAutoCopy();

  const sync = useMessageSync({
    getClient: createClient,
    userId: user.id,
    initialPage,
    initialLoadFailed,
    onSessionExpired: handleSessionExpired,
    onIncoming: autoCopy.handleIncoming,
  });

  // "Copy code" / "Copy message" chosen on a notification.
  useNotificationIntents(sync.messages);

  const loadFailed = sync.loadFailed;
  const messages = filterActive(sync.messages, now);
  const [latest, ...older] = messages;

  const handleDelete = async (message: Message) => {
    sync.removeMessages([message.id]); // Optimistic; restored if the server refuses.
    try {
      const result = await deleteMessage({ id: message.id });
      if (result.ok) {
        toast.success("Message deleted", { duration: 1500 });
        return;
      }
      sync.restoreMessage(message);
      if (result.error.code === "UNAUTHORIZED") return handleSessionExpired();
      toast.error(result.error.message);
    } catch {
      sync.restoreMessage(message);
      toast.error("Couldn't delete the message. Check your connection and try again.");
    }
  };

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      const result = await clearMessages();
      if (result.ok) {
        sync.clearAll();
        toast.success("All messages cleared", { duration: 1500 });
        return;
      }
      if (result.error.code === "UNAUTHORIZED") return handleSessionExpired();
      toast.error(result.error.message);
    } catch {
      toast.error("Couldn't clear your messages. Check your connection and try again.");
    } finally {
      setIsClearing(false);
    }
  };

  const handleRetryLoad = async () => {
    setIsRetrying(true);
    const success = await sync.resync();
    setIsRetrying(false);
    if (!success) toast.error("Still couldn't load your messages.");
  };

  const handleLoadMore = async () => {
    const success = await sync.loadMore();
    if (!success) toast.error("Couldn't load older messages. Please try again.");
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader>
        <ConnectionStatus status={sync.status} />
        <ThemeToggle />
        <AccountMenu email={user.email} />
      </AppHeader>

      <main className="px-safe pb-safe mx-auto w-full max-w-xl flex-1 space-y-8 pt-5">
        <MessageComposer
          online={online}
          onSent={(message) => sync.addMessages([message])}
          onUnauthorized={handleSessionExpired}
          onSending={autoCopy.markSent}
        />

        <NotificationPrompt onUnauthorized={handleSessionExpired} />

        <section aria-labelledby="recent-heading" className="space-y-3">
          <div className="flex min-h-10 items-center justify-between gap-2">
            <h2 id="recent-heading" className="text-sm font-semibold text-muted-foreground">
              Recent
              {messages.length > 0 && (
                <span className="ml-1.5 font-normal tabular-nums">
                  {messages.length}
                  {sync.hasMore ? "+" : ""}
                </span>
              )}
            </h2>

            {messages.length > 0 && (
              <ConfirmDialog
                title="Clear all messages?"
                description="Every message will be deleted from all your devices. This can't be undone."
                confirmLabel="Clear all"
                onConfirm={() => void handleClearAll()}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isClearing}
                    className="h-10 rounded-xl px-3 text-muted-foreground hover:text-destructive"
                  >
                    {isClearing ? (
                      <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2Icon className="size-4" aria-hidden="true" />
                    )}
                    Clear all
                  </Button>
                }
              />
            )}
          </div>

          {loadFailed && (
            <div
              role="alert"
              className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
            >
              <AlertCircleIcon className="size-5 shrink-0 text-destructive" aria-hidden="true" />
              <p className="flex-1">Couldn&apos;t load your messages.</p>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                disabled={isRetrying}
                onClick={() => void handleRetryLoad()}
              >
                <RotateCwIcon
                  className={isRetrying ? "animate-spin" : undefined}
                  aria-hidden="true"
                />
                Retry
              </Button>
            </div>
          )}

          {!loadFailed && messages.length === 0 && <EmptyState />}

          {messages.length > 0 && (
            <ol aria-label="Synced messages, newest first" className="space-y-3">
              {latest && (
                <li key={latest.id}>
                  <MessageCard
                    message={latest}
                    now={now}
                    featured
                    isNew={!initialIds.has(latest.id)}
                    onDelete={(message) => void handleDelete(message)}
                  />
                </li>
              )}
              {older.map((message) => (
                <li key={message.id}>
                  <MessageCard
                    message={message}
                    now={now}
                    isNew={!initialIds.has(message.id)}
                    onDelete={(target) => void handleDelete(target)}
                  />
                </li>
              ))}
            </ol>
          )}

          {sync.hasMore && messages.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-xl"
              disabled={sync.isLoadingMore}
              onClick={() => void handleLoadMore()}
            >
              {sync.isLoadingMore && (
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              )}
              {sync.isLoadingMore ? "Loading…" : "Load older messages"}
            </Button>
          )}
        </section>
      </main>
    </div>
  );
}
