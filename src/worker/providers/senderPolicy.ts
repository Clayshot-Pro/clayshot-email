/** Sender authorization mirrors the explicit Cloudflare Email Service binding.
 * Mailboxes are never allowed merely because an account owner created them.
 */
export function isNativeSenderAllowed(
  env: { PRIMARY_ADDRESS: string; CUSTOM_SENDER_ALLOWLIST?: string },
  email: string,
): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized === env.PRIMARY_ADDRESS.trim().toLowerCase()
    || (env.CUSTOM_SENDER_ALLOWLIST ?? "").split(",").some((entry) => entry.trim().toLowerCase() === normalized);
}
