/** Shared, dependency-free validation for the configured native mail domain. */
export const MAIL_DOMAIN = "clayshotpro.com";
const DEFAULT_DOMAIN = MAIL_DOMAIN;
const RESERVED = new Set(["postmaster", "abuse", "mailer-daemon", "root", "admin"]);

export function mailDomainFromPrimaryAddress(primaryAddress: string): string | null {
  const address = primaryAddress.trim().toLowerCase();
  const at = address.indexOf("@");
  if (at < 1 || at !== address.lastIndexOf("@")) return null;
  const domain = address.slice(at + 1);
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
    ? domain : null;
}

/** Clayshot leaves PRIMARY_ADDRESS empty, so fall back to the Clayshot domain. */
export function configuredMailDomain(primaryAddress: string): string {
  return mailDomainFromPrimaryAddress(primaryAddress) ?? DEFAULT_DOMAIN;
}

export function normalizeMailboxAddress(
  value: string, allowReserved = false, configuredDomain = DEFAULT_DOMAIN,
): string | null {
  const domain = configuredDomain.trim().toLowerCase();
  if (!mailDomainFromPrimaryAddress(`primary@${domain}`)) return null;
  const address = value.trim().toLowerCase();
  const at = address.indexOf("@");
  const local = at >= 0 ? address.slice(0, at) : address;
  const actualDomain = at >= 0 ? address.slice(at + 1) : domain;
  if (actualDomain !== domain || local.length < 1 || local.length > 64
    || !/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?$/.test(local)
    || local.includes("..") || (!allowReserved && RESERVED.has(local))
    || address.length > 254) return null;
  return `${local}@${domain}`;
}
