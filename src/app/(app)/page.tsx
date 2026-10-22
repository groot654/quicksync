import { connection } from "next/server";
import { Suspense } from "react";

import { requireAuthContext } from "@/features/auth/dal";
import { MessagesApp } from "@/features/messages/components/messages-app";
import { MessagesSkeleton } from "@/features/messages/components/messages-skeleton";
import { fetchActiveMessages } from "@/features/messages/queries";
import { logServerError } from "@/lib/action-result";

export default function HomePage() {
  // The skeleton is prerendered into the static shell and shown instantly; the
  // session check and message query stream in behind it.
  return (
    <Suspense fallback={<MessagesSkeleton />}>
      <AuthenticatedMessages />
    </Suspense>
  );
}

async function AuthenticatedMessages() {
  // Render only for a real request: private messages must never be produced by a
  // (runtime) prefetch prerender or land in any prefetch cache.
  await connection();
  const { supabase, user } = await requireAuthContext();
  const result = await fetchActiveMessages(supabase, { userId: user.id });

  if (!result.ok) logServerError("messages.list", { code: result.code });

  return (
    <MessagesApp
      user={user}
      initialPage={result.ok ? result.page : { messages: [], hasMore: false }}
      initialLoadFailed={!result.ok}
    />
  );
}
