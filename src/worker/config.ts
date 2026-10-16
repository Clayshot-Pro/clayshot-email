/**
 * Deployment-aware authentication origin. The Worker request URL (not a
 * client-supplied Origin or X-Forwarded-Host header) is authoritative.
 * WebAuthn relies on the exact browser host: HTTPS in production, or local
 * loopback/localhost for development only.
 */
export function appOrigin(request: Request): string {
  const url = new URL(request.url);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Secure HTTPS origin required");
  }
  return url.origin;
}

export function appHostname(request: Request): string {
  appOrigin(request);
  return new URL(request.url).hostname.toLowerCase();
}

export function passkeyRpId(request: Request): string {
  return appHostname(request);
}

/** Explicit admin identity can differ from the WebAuthn relying-party hostname. */
export function adminLoginAddress(request: Request, configuredAddress?: string): string {
  const host = appHostname(request);
  if (!configuredAddress?.trim()) return `admin@${host}`;
  const address = configuredAddress.trim().toLowerCase();
  if (!/^admin@[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(address)) {
    throw new Error("Invalid configured administrator address");
  }
  return address;
}

/**
 * Preserve the existing admin@<mail domain> sign-in only when this Worker is
 * hosted on that mail domain or a subdomain, so existing owners are not locked
 * out on release. It does not turn admin into a real mailbox.
 */
export function legacyAdminLoginAddress(request: Request, primaryAddress: string): string | null {
  const at = primaryAddress.lastIndexOf("@");
  if (at < 0) return null;
  const domain = primaryAddress.slice(at + 1).trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(domain)) return null;
  const host = appHostname(request);
  return host !== domain && host.endsWith("." + domain) ? `admin@${domain}` : null;
}

export function isAdministratorEmail(
  request: Request, email: string, primaryAddress: string, configuredAddress?: string,
): boolean {
  const normalized = email.trim().toLowerCase();
  const configured = Boolean(configuredAddress?.trim());
  return normalized === adminLoginAddress(request, configuredAddress)
    || (!configured && normalized === legacyAdminLoginAddress(request, primaryAddress));
}
