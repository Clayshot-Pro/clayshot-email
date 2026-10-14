/** Shared input validation for administrator-selected mailbox passwords.
 * The backend applies the same checks before PBKDF2 hashing.
 */
export function mailboxPasswordError(password: unknown): string | null {
  if (typeof password !== "string") return "Enter a password";
  if (password.length < 16) return "Use at least 16 characters";
  if (password.length > 128) return "Use at most 128 characters";
  if (password !== password.trim()) return "Remove leading or trailing spaces";
  if (/[\u0000-\u001f\u007f]/.test(password)) return "Remove control characters";
  if (new Set(password).size < 5) return "Use a less repetitive password";
  return null;
}
