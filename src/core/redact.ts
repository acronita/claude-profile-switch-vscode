/**
 * Redaction helpers.
 *
 * Nothing in this extension logs credential material. These helpers exist so
 * that error paths -- which are the easiest place to leak a token by accident --
 * have a safe default to reach for.
 */

/** Keys whose values must never appear in a log line or notification. */
const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|apikey|api_key|refresh|access|credential|bearer|authorization|cookie|session)/i;

const REDACTED = "[redacted]";

/**
 * Returns a deep copy with the value of every sensitive-looking key replaced.
 * Structure is preserved so the shape of a payload can still be inspected.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 12) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : redact(item, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Normalises an unknown thrown value into a message safe to show a user.
 * Stack traces are dropped, and anything that looks like a long opaque token is
 * masked, in case a dependency-free error string ever embeds one.
 */
export function safeErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error.";
  return maskTokenLikeStrings(raw);
}

/**
 * Masks long, high-entropy-looking substrings (JWTs, OAuth tokens, `sk-ant-…`
 * keys) that could otherwise end up in a message.
 */
export function maskTokenLikeStrings(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, REDACTED)
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, REDACTED)
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, REDACTED);
}
