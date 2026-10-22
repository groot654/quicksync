import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

export type Client = SupabaseClient<Database>;

export function requireEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !publicKey || !serviceKey) {
    throw new Error(
      "Integration tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and " +
        "SUPABASE_SERVICE_ROLE_KEY (run `npx supabase start` and fill .env.local).",
    );
  }
  if (
    !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url) &&
    process.env.ALLOW_REMOTE_TESTS !== "1"
  ) {
    throw new Error("Refusing to run integration tests against a non-local Supabase URL.");
  }
  return { url, publicKey, serviceKey };
}

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export function adminClient(): Client {
  const { url, serviceKey } = requireEnv();
  return createClient<Database>(url, serviceKey, clientOptions);
}

export function anonClient(): Client {
  const { url, publicKey } = requireEnv();
  return createClient<Database>(url, publicKey, clientOptions);
}

export type TestUser = { id: string; email: string; client: Client };

/** Creates a throwaway confirmed user and returns a client signed in as them. */
export async function createTestUser(admin: Client, label: string): Promise<TestUser> {
  const email = `test-${label}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `pw-${randomUUID()}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");

  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  return { id: data.user.id, email, client };
}

export async function deleteTestUser(admin: Client, user: TestUser | undefined) {
  if (!user) return;
  await user.client.removeAllChannels();
  await admin.auth.admin.deleteUser(user.id);
}

export function waitFor<T>(
  check: () => T | undefined,
  { timeout = 10_000, interval = 50 } = {},
): Promise<T> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const value = check();
      if (value !== undefined) return resolve(value);
      if (Date.now() - started > timeout) return reject(new Error("Timed out waiting"));
      setTimeout(tick, interval);
    };
    tick();
  });
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
