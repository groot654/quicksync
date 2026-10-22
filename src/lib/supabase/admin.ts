import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Privileged client that bypasses Row Level Security. Server-only; used solely by the
 * optional cleanup endpoint. Returns `null` when no service key is configured.
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;

  const { supabaseUrl } = getPublicEnv();
  return createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
