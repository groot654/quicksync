import { z } from "zod";

/**
 * Public configuration, safe to ship to the browser.
 *
 * `NEXT_PUBLIC_*` variables must be referenced literally so Next.js can inline them
 * into the client bundle at build time.
 */
const publicEnvSchema = z.object({
  supabaseUrl: z.url({ error: "NEXT_PUBLIC_SUPABASE_URL must be a valid URL" }),
  supabaseKey: z.string().min(1, {
    error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) is required",
  }),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cachedPublicEnv: PublicEnv | undefined;

export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;

  const parsed = publicEnvSchema.safeParse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid Supabase configuration: ${parsed.error.issues.map((issue) => issue.message).join("; ")}. ` +
        "Copy .env.example to .env.local and fill in your project's values.",
    );
  }

  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}

/**
 * Optional comma-separated allowlist of emails permitted to use the app.
 * Returns `null` when unset, meaning any account that can sign in is allowed
 * (sign-ups are disabled in Supabase, so only accounts you create can sign in).
 */
export function getAllowedEmails(): ReadonlySet<string> | null {
  const raw = process.env.QUICKSYNC_ALLOWED_EMAILS?.trim();
  if (!raw) return null;

  const emails = raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return emails.length > 0 ? new Set(emails) : null;
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  const allowed = getAllowedEmails();
  if (!allowed) return true;
  return typeof email === "string" && allowed.has(email.toLowerCase());
}
