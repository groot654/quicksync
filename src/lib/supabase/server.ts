import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Per-request Supabase client for Server Components, Server Actions and Route Handlers.
 * Requests run with the signed-in user's JWT, so Row Level Security applies.
 * Never cache or share this client between requests.
 */
export async function createClient() {
  // Read the request first: this marks the caller as dynamic before any config access.
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseKey } = getPublicEnv();

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. The proxy refreshes the session
          // on every navigation, so this is safe to ignore here.
        }
      },
    },
  });
}
