"use server";

import { redirect } from "next/navigation";

import { ok, logServerError, type ActionResult } from "@/lib/action-result";
import { isEmailAllowed } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

import { loginSchema, type LoginFormState } from "./schemas";

const INVALID_CREDENTIALS = "Incorrect email or password.";
const NOT_AUTHORIZED = "This account is not allowed to use QuickSync.";

export async function signIn(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail : "";

  const parsed = loginSchema.safeParse({
    email: rawEmail,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: LoginFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if ((field === "email" || field === "password") && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return { fieldErrors, email };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    // The same message for every failure, so the form cannot be used to discover accounts.
    if (error && error.status !== 400) logServerError("auth.signIn", error);
    return {
      error:
        error?.status === 429
          ? "Too many attempts. Please wait a minute and try again."
          : INVALID_CREDENTIALS,
      email,
    };
  }

  if (!isEmailAllowed(data.user.email)) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: NOT_AUTHORIZED, email };
  }

  redirect("/");
}

/**
 * Revokes the current session and clears the auth cookies. The client performs a full
 * page navigation afterwards so no message data stays in memory.
 */
export async function signOut(): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) logServerError("auth.signOut", error);
  // Cookies are cleared even if revoking the token remotely failed.
  return ok(null);
}
