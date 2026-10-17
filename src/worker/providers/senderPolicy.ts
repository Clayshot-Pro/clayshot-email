import { configuredMailDomain } from "../mailboxRules.ts";

/** Mailbox-level eligibility is determined by active D1 records. All native
 * addresses in the configured sending domain are eligible once Email Service
 * is configured. Do not accept arbitrary From addresses from a client.
 */
export function isNativeSenderAllowed(env: { PRIMARY_ADDRESS: string }, email: string): boolean {
  const address = email.trim().toLowerCase();
  const suffix = `@${configuredMailDomain(env.PRIMARY_ADDRESS)}`;
  return address.endsWith(suffix) && address.indexOf("@") === address.lastIndexOf("@");
}


/** Select the Cloudflare binding for an authenticated native mailbox. */
export function nativeSendBinding(
  env: { EMAIL: EmailServiceBinding; EMAIL_DYNAMIC?: EmailServiceBinding },
  accountId: string,
): EmailServiceBinding | null {
  return accountId === "native:primary" ? env.EMAIL : env.EMAIL_DYNAMIC ?? null;
}
