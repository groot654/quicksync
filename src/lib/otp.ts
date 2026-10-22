const OTP_KEYWORDS =
  /\b(code|otp|pin|passcode|password|verification|verify|one[-\s]?time|security|login|sign[-\s]?in|2fa|auth\w*|tac|token)\b/i;

/** A standalone run of 4–8 digits, optionally split once by a space or hyphen (e.g. "123 456"). */
const OTP_CANDIDATE = /(?<![\d\w])(\d{3,4}[\s-]\d{3,4}|\d{4,8})(?![\d\w])/g;

/**
 * Finds a one-time code in an SMS-style message so it can be copied on its own.
 *
 * Only messages that mention a code-like keyword qualify, to avoid treating
 * amounts, dates or phone numbers as codes. Returns the digits without separators.
 */
export function extractOtp(content: string): string | null {
  if (content.length > 1000 || !OTP_KEYWORDS.test(content)) return null;

  for (const match of content.matchAll(OTP_CANDIDATE)) {
    const digits = match[1].replace(/[\s-]/g, "");
    if (digits.length < 4 || digits.length > 8) continue;
    // Skip years such as 2025 that often appear in message footers.
    if (digits.length === 4 && /^(19|20)\d{2}$/.test(digits)) continue;
    return digits;
  }
  return null;
}
