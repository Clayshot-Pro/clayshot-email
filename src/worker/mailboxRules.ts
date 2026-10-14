/** Shared, dependency-free address validation for inbound and login. */
const DOMAIN = "liamthemo.com";
const RESERVED = new Set(["postmaster", "abuse", "mailer-daemon", "root", "admin"]);

export function normalizeMailboxAddress(value: string, allowReserved = false): string | null {
  const address = value.trim().toLowerCase();
  const at = address.indexOf("@");
  const local = at >= 0 ? address.slice(0, at) : address;
  const domain = at >= 0 ? address.slice(at + 1) : DOMAIN;
  if (domain !== DOMAIN || local.length < 1 || local.length > 64
    || !/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?$/.test(local)
    || local.includes("..") || (!allowReserved && RESERVED.has(local))
    || address.length > 254) return null;
  return `${local}@${DOMAIN}`;
}
