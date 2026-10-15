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

/** Admin has separate 8–32 character limits; mailbox passwords stay 16–128. */
export function adminPasswordError(password: unknown): string | null {
  if (typeof password !== "string") return "Enter an administrator password";
  if (password.length < 8) return "Use at least 8 characters";
  if (password.length > 32) return "Use at most 32 characters";
  if (password !== password.trim()) return "Remove leading or trailing spaces";
  if (/[\u0000-\u001f\u007f]/.test(password)) return "Remove control characters";
  if (new Set(password).size < 5) return "Use a less repetitive password";
  return null;
}
