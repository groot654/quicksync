import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { isEmailAllowed } from "@/lib/env";
import { createClient, type ServerSupabaseClient } from "@/lib/supabase/server";

export type AuthUser = {
  id: string;
  email: string | null;
};

export type AuthContext = {
  supabase: ServerSupabaseClient;
  user: AuthUser;
};

/**
 * Data Access Layer entry point. Verifies the session on the server, either by
 * validating the JWT signature locally (asymmetric keys) or by asking Supabase Auth.
 * Never trusts unverified cookie contents.
 *
 * Returns `null` when signed out, when the session is invalid or expired, or when the
 * account is not on the optional `QUICKSYNC_ALLOWED_EMAILS` allowlist.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) return null;

  const email = typeof claims.email === "string" ? claims.email : null;
  if (!isEmailAllowed(email)) return null;

  return { supabase, user: { id: claims.sub, email } };
}

/** Request-scoped and memoized; use in Server Components. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const context = await getAuthContext();
  return context?.user ?? null;
});

/** Redirects to the login page when there is no valid session. */
export async function requireAuthContext(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) redirect("/login");
  return context;
}
