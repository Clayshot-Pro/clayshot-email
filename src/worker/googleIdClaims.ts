import { normalizeMailboxAddress } from "./mailboxRules.ts";

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export type GoogleIdClaims = {
  iss?: string; aud?: string; exp?: number; nonce?: string;
  email?: string; email_verified?: boolean | string; hd?: string;
};

/** The ID token comes straight from Google's token endpoint over TLS using the
 * client secret, so OIDC Core 3.1.3.7 permits skipping signature validation;
 * every remaining claim is still checked. Returns the mailbox address. */
export function verifiedGoogleEmail(
  claims: GoogleIdClaims | null, clientId: string, nonce: string, domain: string, now = Date.now(),
): string | null {
  if (!claims || !GOOGLE_ISSUERS.has(claims.iss ?? "") || claims.aud !== clientId) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now || claims.nonce !== nonce) return null;
  if (claims.email_verified !== true && claims.email_verified !== "true") return null;
  // hd is only present for Google Workspace / Cloud Identity accounts.
  if (claims.hd?.toLowerCase() !== domain || typeof claims.email !== "string") return null;
  return normalizeMailboxAddress(claims.email, false, domain);
}

