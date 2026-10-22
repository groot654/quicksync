export type ActionErrorCode = "UNAUTHORIZED" | "VALIDATION" | "SERVER";

export type ActionError = {
  code: ActionErrorCode;
  /** Safe, user-facing message. Never contains implementation details. */
  message: string;
};

/** Consistent return shape for every Server Action. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(code: ActionErrorCode, message: string): ActionResult<T> {
  return { ok: false, error: { code, message } };
}

export const UNAUTHORIZED_MESSAGE = "Your session has expired. Please sign in again.";

/**
 * Logs a failed database or auth call without its payload. Supabase error details can
 * echo row values (for example "Failing row contains (...)"), which may include message
 * text, so only the operation name and error code are recorded.
 */
export function logServerError(operation: string, error: { code?: string | null } | unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "unknown")
      : "unknown";
  console.error(`[quicksync] ${operation} failed (code: ${code})`);
}
