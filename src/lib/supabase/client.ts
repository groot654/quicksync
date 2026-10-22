import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export type BrowserSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;

/**
 * Browser Supabase client. `createBrowserClient` returns a singleton, so calling this
 * from several components shares one auth session and one Realtime socket.
 */
export function createClient(): BrowserSupabaseClient {
  const { supabaseUrl, supabaseKey } = getPublicEnv();
  return createBrowserClient<Database>(supabaseUrl, supabaseKey);
}
