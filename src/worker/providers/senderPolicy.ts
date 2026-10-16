/** Mailbox-level eligibility is determined by active D1 records. All native
 * addresses in the configured sending domain are eligible once Email Service
 * is configured. Do not accept arbitrary From addresses from a client.
 */
export function isNativeSenderAllowed(env: { PRIMARY_ADDRESS: string }, email: string): boolean {
  const address = email.trim().toLowerCase();
  const primary = env.PRIMARY_ADDRESS.trim().toLowerCase();
  const suffix = primary.slice(primary.lastIndexOf("@"));
  return suffix.length > 1 && address.endsWith(suffix) && address.indexOf("@") === address.lastIndexOf("@");
}

